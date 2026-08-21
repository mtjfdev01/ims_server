import { BadRequestException, Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Item } from './entities/item.entity';
import { Company } from '../companies/entities/company.entity';
import { Category } from '../category/entities/category.entity';
import { Store } from '../stores/entities/store.entity';
import { Shop } from '../shops/entities/shop.entity';
import { PurchasesService } from '../purchases/purchases.service';
import { FifoService } from '../stock-lots/fifo.service';

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

      const item = itemRepo.create({
        name: createItemDto.name.trim(),
        location: createItemDto.location,
        quantity: 0,
        purchasePrice: createItemDto.purchasePrice || 0,
        minimumSalePrice: createItemDto.minimumSalePrice,
      });

      const company = await companyRepo.findOne({
        where: { id: createItemDto.company },
      });
      if (!company) {
        throw new BadRequestException(`Company with ID ${createItemDto.company} not found`);
      }
      item.company = company;

      if (createItemDto.categories && createItemDto.categories.length > 0) {
        const categories = await categoryRepo.findBy({
          id: In(createItemDto.categories),
        });
        item.categories = categories;
      }

      if (createItemDto.storeId) {
        const store = await storeRepo.findOne({ where: { id: createItemDto.storeId } });
        if (store) {
          item.store = store;
        }
      }

      if (createItemDto.shopId) {
        const shop = await shopRepo.findOne({ where: { id: createItemDto.shopId } });
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

  findAll(filterType?: 'store' | 'shop', search?: string): Promise<Item[]> {
    const queryBuilder = this.itemsRepository.createQueryBuilder('item')
      .leftJoinAndSelect('item.company', 'company')
      .leftJoinAndSelect('item.categories', 'categories')
      .leftJoinAndSelect('item.store', 'store')
      .leftJoinAndSelect('item.shop', 'shop')
      .where('item.is_archived = :archived', { archived: false });

    if (filterType === 'store') {
      queryBuilder.andWhere('item.store_id IS NOT NULL');
    } else if (filterType === 'shop') {
      queryBuilder.andWhere('item.shop_id IS NOT NULL');
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      queryBuilder.andWhere('item.name ILIKE :search', { search: searchTerm });
    }

    return queryBuilder.getMany();
  }

  async findOne(id: number): Promise<any> {
    const item = await this.itemsRepository.findOne({
      where: { id, is_archived: false },
      relations: ['company', 'categories', 'store', 'shop'],
    });
    if (!item) {
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
        where: { id, is_archived: false },
        relations: ['company', 'categories', 'store', 'shop'],
      });

      if (!item) {
        return null;
      }

      if (updateItemDto.name !== undefined) {
        item.name = updateItemDto.name;
      }
      if (updateItemDto.location !== undefined) {
        item.location = updateItemDto.location;
      }
      if (updateItemDto.minimumSalePrice !== undefined) {
        item.minimumSalePrice = updateItemDto.minimumSalePrice;
      }

      if (updateItemDto.company !== undefined) {
        const company = await companyRepo.findOne({
          where: { id: updateItemDto.company },
        });
        if (company) {
          item.company = company;
        }
      }

      if (updateItemDto.categories !== undefined) {
        if (updateItemDto.categories.length > 0) {
          const categories = await categoryRepo.findBy({
            id: In(updateItemDto.categories),
          });
          item.categories = categories;
        } else {
          item.categories = [];
        }
      }

      if (updateItemDto.storeId !== undefined) {
        if (updateItemDto.storeId) {
          const store = await storeRepo.findOne({
            where: { id: updateItemDto.storeId },
          });
          item.store = store ?? null;
          item.shop = null;
        } else {
          item.store = null;
        }
      }

      if (updateItemDto.shopId !== undefined) {
        if (updateItemDto.shopId) {
          const shop = await shopRepo.findOne({
            where: { id: updateItemDto.shopId },
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
      where: { id, is_archived: false },
    });

    if (!item) {
      return false;
    }

    item.is_archived = true;
    await this.itemsRepository.save(item);
    return true;
  }

  findByStore(storeId: number): Promise<Item[]> {
    return this.itemsRepository.find({
      where: { store: { id: storeId }, is_archived: false },
      relations: ['company', 'categories', 'store', 'shop'],
    });
  }

  findByShop(shopId: number): Promise<Item[]> {
    return this.itemsRepository.find({
      where: { shop: { id: shopId }, is_archived: false },
      relations: ['company', 'categories', 'store', 'shop'],
    });
  }

  findAllShopItems(): Promise<Item[]> {
    const queryBuilder = this.itemsRepository.createQueryBuilder('item')
      .leftJoinAndSelect('item.company', 'company')
      .leftJoinAndSelect('item.categories', 'categories')
      .leftJoinAndSelect('item.store', 'store')
      .leftJoinAndSelect('item.shop', 'shop')
      .where('item.shop_id IS NOT NULL')
      .andWhere('item.is_archived = :archived', { archived: false });
    return queryBuilder.getMany();
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
        where: { id: transferDto.itemId, is_archived: false },
        relations: ['store', 'shop', 'company', 'categories'],
      });

      if (!sourceItem) {
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
      } else if (transferDto.fromShopId) {
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
          where: { id: transferDto.toStoreId },
        });
        if (!destinationStore) {
          throw new BadRequestException('Destination store not found');
        }
      } else if (transferDto.toShopId) {
        destinationShop = await shopRepo.findOne({
          where: { id: transferDto.toShopId },
        });
        if (!destinationShop) {
          throw new BadRequestException('Destination shop not found');
        }
      } else {
        throw new BadRequestException('Destination location must be specified');
      }

      const categoryIds = sourceItem.categories?.map(c => c.id) || [];
      let destinationItem: Item | null = null;

      if (destinationStore) {
        destinationItem = await itemRepo.findOne({
          where: {
            company: { id: sourceItem.company.id },
            store: { id: destinationStore.id },
            is_archived: false,
          },
          relations: ['company', 'categories', 'store', 'shop'],
        });
      } else if (destinationShop) {
        destinationItem = await itemRepo.findOne({
          where: {
            company: { id: sourceItem.company.id },
            shop: { id: destinationShop.id },
            is_archived: false,
          },
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
      }

      if (!destinationItem) {
        destinationItem = await itemRepo.save(itemRepo.create({
          name: sourceItem.name,
          company: sourceItem.company,
          categories: sourceItem.categories,
          store: destinationStore,
          shop: destinationShop,
          location: sourceItem.location,
          quantity: 0,
          purchasePrice: sourceItem.purchasePrice,
          minimumSalePrice: sourceItem.minimumSalePrice,
        }));
      }

      if (!destinationItem) {
        throw new BadRequestException('Failed to resolve destination item');
      }

      await this.fifoService.transferLots(em, sourceItem, destinationItem, transferQuantity);

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

  async removeAll(): Promise<number> {
    const result = await this.itemsRepository.update({ is_archived: false }, { is_archived: true });
    return result.affected || 0;
  }
}
