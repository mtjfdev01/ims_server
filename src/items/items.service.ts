import { BadRequestException, Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, In } from 'typeorm';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Item } from './entities/item.entity';
import { Company } from '../companies/entities/company.entity';
import { Category } from '../category/entities/category.entity';
import { Store } from '../stores/entities/store.entity';
import { Shop } from '../shops/entities/shop.entity';
import { PurchasesService } from '../purchases/purchases.service';
import { FifoService } from '../stock-lots/fifo.service';
import { paginateQuery } from '../common/pagination.util';
import { assertShopAccess, assertStoreAccess, canAccessOptionalShopRecord, requireSuperAdmin, requireTenantId, requireUser, skipsShopFilter, stampOwnership, tenantWhere } from '../common/access.util';
import { isItemCondition, normalizeUniqueIdentifier, SECOND_HAND_CONDITIONS } from './item-condition';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private itemsRepository: Repository<Item>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectRepository(Store)
    private storeRepository: Repository<Store>,
    @InjectRepository(Shop)
    private shopRepository: Repository<Shop>,
    @Inject(forwardRef(() => PurchasesService))
    private purchasesService: PurchasesService,
    private fifoService: FifoService,
    private dataSource: DataSource,
  ) {}

  async create(createItemDto: CreateItemDto): Promise<Item> {
    if (!createItemDto.name || !createItemDto.name.trim()) {
      throw new BadRequestException('Item name is required');
    }
    if (!createItemDto.company || typeof createItemDto.company !== 'number') {
      throw new BadRequestException('Company is required and must be a valid ID');
    }

    return this.dataSource.transaction(async (em) => {
      const itemRepo = em.getRepository(Item);
      const companyRepo = em.getRepository(Company);
      const categoryRepo = em.getRepository(Category);
      const storeRepo = em.getRepository(Store);
      const shopRepo = em.getRepository(Shop);

      const uniqueIdentifier = normalizeUniqueIdentifier(createItemDto.uniqueIdentifier);
      const condition = createItemDto.condition && isItemCondition(createItemDto.condition)
        ? createItemDto.condition
        : null;
      await this.assertUniqueIdentifierAvailable(em, uniqueIdentifier);

      const item = itemRepo.create({
        name: createItemDto.name.trim(),
        location: createItemDto.location?.trim() || null,
        uniqueIdentifier,
        condition,
        quantity: 0,
        purchasePrice: createItemDto.purchasePrice || 0,
        minimumSalePrice: createItemDto.minimumSalePrice,
      });
      stampOwnership(item);

      const company = await companyRepo.findOne({
        where: tenantWhere({ id: createItemDto.company }),
      });
      if (!company) {
        throw new BadRequestException(`Company with ID ${createItemDto.company} not found`);
      }
      item.company = company;

      if (createItemDto.categories && createItemDto.categories.length > 0) {
        const categories = await categoryRepo.find({
          where: tenantWhere({ id: In(createItemDto.categories) }),
        });
        item.categories = categories;
      }

      if (createItemDto.storeId) {
        const store = await storeRepo.findOne({
          where: tenantWhere({ id: createItemDto.storeId }),
          relations: ['shops'],
        });
        if (!store) {
          throw new BadRequestException('Store not found');
        }
        assertStoreAccess(store);
        item.store = store;
      }

      if (createItemDto.shopId) {
        assertShopAccess(createItemDto.shopId);
        const shop = await shopRepo.findOne({ where: tenantWhere({ id: createItemDto.shopId }) });
        if (shop) {
          item.shop = shop;
          item.store = null;
        }
      }

      const savedItem = await itemRepo.save(item);
      const openingQty = createItemDto.quantity || 0;
      if (openingQty > 0) {
        await this.purchasesService.create({
          itemId: savedItem.id,
          purchasePrice: createItemDto.purchasePrice || 0,
          quantity: openingQty,
          purchaseDate: new Date().toISOString().split('T')[0],
          shopId: createItemDto.shopId,
        }, em);
      }

      const result = await itemRepo.findOne({
        where: { id: savedItem.id },
        relations: ['company', 'categories', 'store', 'shop'],
      });
      if (!result) {
        throw new BadRequestException('Failed to reload item after creation');
      }
      return result;
    });
  }

  findAll(
    filterType?: 'store' | 'shop',
    search?: string,
    shopId?: number,
    storeId?: number,
    dates?: { date?: string; dateFrom?: string; dateTo?: string },
    page?: number,
    limit?: number,
    condition?: string,
    companyId?: number,
    categoryId?: number,
  ) {
    const user = requireUser();
    const queryBuilder = this.itemsRepository.createQueryBuilder('item')
      .leftJoinAndSelect('item.company', 'company')
      .leftJoinAndSelect('item.categories', 'categories')
      .leftJoinAndSelect('item.store', 'store')
      .leftJoinAndSelect('item.shop', 'shop')
      .where('item.is_archived = :archived', { archived: false });

    const scoped = tenantWhere();
    if (scoped.tenant) {
      queryBuilder.andWhere('item.tenant_id = :tenantId', { tenantId: scoped.tenant.id });
    }

    if (storeId) {
      queryBuilder.andWhere('item.store_id = :storeId', { storeId });
      if (!skipsShopFilter(user)) {
        queryBuilder.andWhere('1 = 0');
      }
    } else if (shopId) {
      assertShopAccess(shopId);
      queryBuilder.andWhere('item.shop_id = :shopId', { shopId });
    } else if (filterType === 'store') {
      queryBuilder.andWhere('item.store_id IS NOT NULL');
      if (!skipsShopFilter(user)) {
        queryBuilder.andWhere('1 = 0');
      }
    } else if (filterType === 'shop') {
      queryBuilder.andWhere('item.shop_id IS NOT NULL');
      if (!skipsShopFilter(user)) {
        const ids = user.shopIds.length ? user.shopIds : [-1];
        queryBuilder.andWhere('item.shop_id IN (:...shopIds)', { shopIds: ids });
      }
    } else if (!skipsShopFilter(user)) {
      const ids = user.shopIds.length ? user.shopIds : [-1];
      queryBuilder.andWhere('item.shop_id IN (:...shopIds)', { shopIds: ids });
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      queryBuilder.andWhere(
        '(item.name ILIKE :search OR item.uniqueIdentifier ILIKE :search)',
        { search: searchTerm },
      );
    }

    if (condition === 'second_hand') {
      queryBuilder.andWhere('item.condition IN (:...secondHand)', { secondHand: SECOND_HAND_CONDITIONS });
    } else if (condition && isItemCondition(condition)) {
      queryBuilder.andWhere('item.condition = :condition', { condition });
    }

    if (companyId) {
      queryBuilder.andWhere('item.company_id = :companyId', { companyId });
    }
    if (categoryId) {
      queryBuilder.andWhere(`EXISTS (
        SELECT 1 FROM item_categories ic
        WHERE ic.item_id = item.id AND ic.category_id = :categoryId
      )`, { categoryId });
    }

    if (dates?.date) {
      queryBuilder.andWhere('DATE(item.createdAt) = DATE(:date)', { date: dates.date });
    } else {
      if (dates?.dateFrom) {
        queryBuilder.andWhere('DATE(item.createdAt) >= DATE(:dateFrom)', { dateFrom: dates.dateFrom });
      }
      if (dates?.dateTo) {
        queryBuilder.andWhere('DATE(item.createdAt) <= DATE(:dateTo)', { dateTo: dates.dateTo });
      }
    }

    queryBuilder.orderBy('item.name', 'ASC');
    return paginateQuery(queryBuilder, { page, limit });
  }

  async findOne(id: number): Promise<any> {
    const item = await this.itemsRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['company', 'categories', 'store', 'shop'],
    });
    if (!item || !canAccessOptionalShopRecord(item.shop?.id)) {
      return null;
    }

    const lots = await this.fifoService.getRemainingLots(id);
    const remainingLots = lots.filter(lot => lot.remainingQuantity > 0);
    const fifoValue = remainingLots.reduce(
      (sum, lot) => sum + lot.remainingQuantity * Number(lot.unitCost),
      0,
    );

    return {
      ...item,
      lots: remainingLots.map(lot => ({
        id: lot.id,
        remainingQuantity: lot.remainingQuantity,
        originalQuantity: lot.originalQuantity,
        unitCost: Number(lot.unitCost),
        receivedAt: lot.receivedAt,
      })),
      fifoValue: parseFloat(fifoValue.toFixed(2)),
    };
  }

  async update(id: number, updateItemDto: UpdateItemDto): Promise<Item | null> {
    return this.dataSource.transaction(async (em) => {
      const itemRepo = em.getRepository(Item);
      const companyRepo = em.getRepository(Company);
      const categoryRepo = em.getRepository(Category);
      const storeRepo = em.getRepository(Store);
      const shopRepo = em.getRepository(Shop);

      const item = await itemRepo.findOne({
        where: tenantWhere({ id, is_archived: false }),
        relations: ['company', 'categories', 'store', 'shop'],
      });

      if (!item || !canAccessOptionalShopRecord(item.shop?.id)) {
        return null;
      }

      if (updateItemDto.name !== undefined) {
        item.name = updateItemDto.name;
      }
      if (updateItemDto.location !== undefined) {
        item.location = updateItemDto.location;
      }
      if (updateItemDto.uniqueIdentifier !== undefined) {
        const uniqueIdentifier = normalizeUniqueIdentifier(updateItemDto.uniqueIdentifier);
        await this.assertUniqueIdentifierAvailable(em, uniqueIdentifier, item.id);
        item.uniqueIdentifier = uniqueIdentifier;
      }
      if (updateItemDto.condition !== undefined) {
        item.condition = updateItemDto.condition && isItemCondition(updateItemDto.condition)
          ? updateItemDto.condition
          : null;
      }
      if (updateItemDto.minimumSalePrice !== undefined) {
        item.minimumSalePrice = updateItemDto.minimumSalePrice;
      }

      if (updateItemDto.company !== undefined) {
        const company = await companyRepo.findOne({
          where: tenantWhere({ id: updateItemDto.company }),
        });
        if (company) {
          item.company = company;
        }
      }

      if (updateItemDto.categories !== undefined) {
        if (updateItemDto.categories.length > 0) {
          const categories = await categoryRepo.find({
            where: tenantWhere({ id: In(updateItemDto.categories) }),
          });
          item.categories = categories;
        } else {
          item.categories = [];
        }
      }

      if (updateItemDto.storeId !== undefined) {
        if (updateItemDto.storeId) {
          const store = await storeRepo.findOne({
            where: tenantWhere({ id: updateItemDto.storeId }),
            relations: ['shops'],
          });
          if (!store) {
            throw new BadRequestException('Store not found');
          }
          assertStoreAccess(store);
          item.store = store;
          item.shop = null;
        } else {
          item.store = null;
        }
      }

      if (updateItemDto.shopId !== undefined) {
        if (updateItemDto.shopId) {
          assertShopAccess(updateItemDto.shopId);
          const shop = await shopRepo.findOne({
            where: tenantWhere({ id: updateItemDto.shopId }),
          });
          item.shop = shop ?? null;
          item.store = null;
        } else {
          item.shop = null;
        }
      }

      await itemRepo.save(item);

      if (updateItemDto.quantity !== undefined) {
        await this.fifoService.ensureLots(em, item);
        const refreshed = await this.fifoService.refreshItem(em, item.id);
        const currentQty = refreshed.quantity || 0;
        const nextQty = updateItemDto.quantity;
        if (nextQty > currentQty) {
          await this.fifoService.addStock(
            em,
            refreshed,
            nextQty - currentQty,
            Number(updateItemDto.purchasePrice ?? refreshed.purchasePrice) || 0,
            new Date(),
          );
        } else if (nextQty < currentQty) {
          await this.fifoService.consume(em, refreshed, currentQty - nextQty);
        }
      }

      const result = await itemRepo.findOne({
        where: { id, is_archived: false },
        relations: ['company', 'categories', 'store', 'shop'],
      });
      return result;
    });
  }

  async remove(id: number): Promise<boolean> {
    const item = await this.itemsRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['shop'],
    });

    if (!item || !canAccessOptionalShopRecord(item.shop?.id)) {
      return false;
    }

    item.is_archived = true;
    await this.itemsRepository.save(item);
    return true;
  }

  async findByStore(storeId: number): Promise<Item[]> {
    const store = await this.storeRepository.findOne({
      where: tenantWhere({ id: storeId, is_archived: false }),
      relations: ['shops'],
    });
    if (!store) {
      return [];
    }
    assertStoreAccess(store);
    return this.itemsRepository.find({
      where: tenantWhere({ store: { id: storeId }, is_archived: false }),
      relations: ['company', 'categories', 'store', 'shop'],
    });
  }

  findByShop(shopId: number): Promise<Item[]> {
    assertShopAccess(shopId);
    return this.itemsRepository.find({
      where: tenantWhere({ shop: { id: shopId }, is_archived: false }),
      relations: ['company', 'categories', 'store', 'shop'],
    });
  }

  findAllShopItems() {
    return this.findAll('shop');
  }

  async transfer(transferDto: {
    itemId: number;
    quantity: number;
    fromStoreId?: number;
    fromShopId?: number;
    toStoreId?: number;
    toShopId?: number;
    notes?: string;
  }): Promise<{ sourceItem: Item; destinationItem: Item }> {
    return this.dataSource.transaction(async (em) => {
      const itemRepo = em.getRepository(Item);
      const storeRepo = em.getRepository(Store);
      const shopRepo = em.getRepository(Shop);

      const sourceItem = await itemRepo.findOne({
        where: tenantWhere({ id: transferDto.itemId, is_archived: false }),
        relations: ['store', 'shop', 'company', 'categories'],
      });

      if (!sourceItem || !canAccessOptionalShopRecord(sourceItem.shop?.id)) {
        throw new BadRequestException('Item not found');
      }

      const transferQuantity = transferDto.quantity || 1;
      if (transferQuantity <= 0) {
        throw new BadRequestException('Transfer quantity must be greater than 0');
      }

      if (transferDto.fromStoreId) {
        if (!sourceItem.store || sourceItem.store.id !== transferDto.fromStoreId) {
          throw new BadRequestException('Item is not in the specified store');
        }
        const fromStore = await storeRepo.findOne({
          where: tenantWhere({ id: transferDto.fromStoreId }),
          relations: ['shops'],
        });
        assertStoreAccess(fromStore);
      } else if (transferDto.fromShopId) {
        assertShopAccess(transferDto.fromShopId);
        if (!sourceItem.shop || sourceItem.shop.id !== transferDto.fromShopId) {
          throw new BadRequestException('Item is not in the specified shop');
        }
      } else {
        throw new BadRequestException('Source location must be specified');
      }

      let destinationStore: Store | null = null;
      let destinationShop: Shop | null = null;

      if (transferDto.toStoreId) {
        destinationStore = await storeRepo.findOne({
          where: tenantWhere({ id: transferDto.toStoreId }),
          relations: ['shops'],
        });
        if (!destinationStore) {
          throw new BadRequestException('Destination store not found');
        }
        assertStoreAccess(destinationStore);
      } else if (transferDto.toShopId) {
        assertShopAccess(transferDto.toShopId);
        destinationShop = await shopRepo.findOne({
          where: tenantWhere({ id: transferDto.toShopId }),
        });
        if (!destinationShop) {
          throw new BadRequestException('Destination shop not found');
        }
      } else {
        throw new BadRequestException('Destination location must be specified');
      }

      const categoryIds = sourceItem.categories?.map(c => c.id) || [];
      const movingWholeSerialized = Boolean(sourceItem.uniqueIdentifier)
        && transferQuantity >= Number(sourceItem.quantity || 0);
      let destinationItem: Item | null = null;

      if (destinationStore) {
        destinationItem = await itemRepo.findOne({
          where: tenantWhere({
            company: { id: sourceItem.company.id },
            store: { id: destinationStore.id },
            is_archived: false,
          }),
          relations: ['company', 'categories', 'store', 'shop'],
        });
      } else if (destinationShop) {
        destinationItem = await itemRepo.findOne({
          where: tenantWhere({
            company: { id: sourceItem.company.id },
            shop: { id: destinationShop.id },
            is_archived: false,
          }),
          relations: ['company', 'categories', 'store', 'shop'],
        });
      }

      if (destinationItem) {
        const destCategoryIds = [...(destinationItem.categories?.map(c => c.id) || [])].sort();
        const sourceCategoryIds = [...categoryIds].sort();
        const categoriesMatch =
          destCategoryIds.length === sourceCategoryIds.length &&
          destCategoryIds.every((catId, idx) => catId === sourceCategoryIds[idx]);

        if (!categoriesMatch || destinationItem.name !== sourceItem.name) {
          destinationItem = null;
        }
        if (
          destinationItem
          && sourceItem.uniqueIdentifier
          && destinationItem.uniqueIdentifier !== sourceItem.uniqueIdentifier
        ) {
          destinationItem = null;
        }
      }

      if (!destinationItem) {
        const created = itemRepo.create({
          name: sourceItem.name,
          company: sourceItem.company,
          categories: sourceItem.categories,
          store: destinationStore,
          shop: destinationShop,
          location: sourceItem.location,
          uniqueIdentifier: movingWholeSerialized ? sourceItem.uniqueIdentifier : null,
          condition: sourceItem.condition,
          quantity: 0,
          purchasePrice: sourceItem.purchasePrice,
          minimumSalePrice: sourceItem.minimumSalePrice,
        });
        stampOwnership(created);
        destinationItem = await itemRepo.save(created);
      }

      if (!destinationItem) {
        throw new BadRequestException('Failed to resolve destination item');
      }

      await this.fifoService.transferLots(em, sourceItem, destinationItem, transferQuantity);
      if (movingWholeSerialized) {
        await itemRepo.update({ id: sourceItem.id }, { uniqueIdentifier: null });
        if (!destinationItem.uniqueIdentifier) {
          await itemRepo.update({ id: destinationItem.id }, { uniqueIdentifier: sourceItem.uniqueIdentifier });
        }
      }

      const updatedSource = await itemRepo.findOne({
        where: { id: sourceItem.id },
        relations: ['store', 'shop', 'company', 'categories'],
      });
      const updatedDestination = await itemRepo.findOne({
        where: { id: destinationItem.id },
        relations: ['store', 'shop', 'company', 'categories'],
      });

      return {
        sourceItem: updatedSource as Item,
        destinationItem: updatedDestination as Item,
      };
    });
  }

  private async assertUniqueIdentifierAvailable(
    em: EntityManager,
    uniqueIdentifier: string | null,
    excludeId?: number,
  ): Promise<void> {
    if (!uniqueIdentifier) {
      return;
    }
    const query = em.getRepository(Item).createQueryBuilder('item')
      .where('item.is_archived = :archived', { archived: false })
      .andWhere('LOWER(item.uniqueIdentifier) = LOWER(:uniqueIdentifier)', { uniqueIdentifier });
    const scoped = tenantWhere();
    if (scoped.tenant) {
      query.andWhere('item.tenant_id = :tenantId', { tenantId: scoped.tenant.id });
    }
    if (excludeId) {
      query.andWhere('item.id != :excludeId', { excludeId });
    }
    const existing = await query.getOne();
    if (existing) {
      throw new BadRequestException('An item with this unique identifier already exists');
    }
  }

  async removeAll(): Promise<number> {
    requireSuperAdmin();
    requireTenantId();
    const result = await this.itemsRepository.update(tenantWhere({ is_archived: false }), { is_archived: true });
    return result.affected || 0;
  }
}
