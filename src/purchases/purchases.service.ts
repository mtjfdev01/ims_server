import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { Purchase } from './entities/purchase.entity';
import { Item } from '../items/entities/item.entity';
import { Shop } from '../shops/entities/shop.entity';
import { FilterDto } from '../common/filter.dto';
import { paginateQuery } from '../common/pagination.util';
import { applyItemConditionFilter } from '../items/item-condition';
import { FifoService } from '../stock-lots/fifo.service';
import { SellersService } from '../sellers/sellers.service';
import { applyShopScope, applyTenantScope, assertShopAccess, canAccessOptionalShopRecord, stampOwnership, tenantWhere } from '../common/access.util';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase)
    private purchasesRepository: Repository<Purchase>,
    @InjectRepository(Item)
    private itemRepository: Repository<Item>,
    @InjectRepository(Shop)
    private shopRepository: Repository<Shop>,
    private fifoService: FifoService,
    private sellersService: SellersService,
    private dataSource: DataSource,
  ) {}

  async create(createPurchaseDto: CreatePurchaseDto, manager?: EntityManager): Promise<Purchase> {
    const run = async (em: EntityManager) => {
      const itemRepo = em.getRepository(Item);
      const shopRepo = em.getRepository(Shop);
      const purchaseRepo = em.getRepository(Purchase);

      const item = await itemRepo.findOne({
        where: tenantWhere({ id: createPurchaseDto.itemId, is_archived: false }),
        relations: ['shop'],
      });

      if (!item) {
        throw new BadRequestException(`Item with ID ${createPurchaseDto.itemId} not found`);
      }

      const quantity = createPurchaseDto.quantity || 1;
      if (quantity <= 0) {
        throw new BadRequestException('Purchase quantity must be greater than 0');
      }

      const purchase = purchaseRepo.create({
        item,
        purchasePrice: createPurchaseDto.purchasePrice,
        quantity,
        purchaseDate: createPurchaseDto.purchaseDate
          ? new Date(createPurchaseDto.purchaseDate)
          : new Date(),
      });
      stampOwnership(purchase);

      const shopId = createPurchaseDto.shopId || item.shop?.id;
      if (item.shop && shopId && Number(item.shop.id) !== Number(shopId)) {
        throw new BadRequestException('Purchase shop must match the item shop');
      }
      if (item.shop) {
        assertShopAccess(item.shop.id);
      }
      if (shopId) {
        assertShopAccess(shopId);
        const shop = await shopRepo.findOne({ where: tenantWhere({ id: shopId }) });
        if (shop) {
          purchase.shop = shop;
        }
      }

      if (createPurchaseDto.sellerId || createPurchaseDto.newSeller?.name?.trim()) {
        purchase.seller = await this.sellersService.resolveForShop(
          shopId || item.shop?.id,
          createPurchaseDto.sellerId || undefined,
          createPurchaseDto.newSeller,
          em,
        );
      }

      const savedPurchase = await purchaseRepo.save(purchase);
      await this.fifoService.addStock(
        em,
        item,
        quantity,
        Number(createPurchaseDto.purchasePrice) || 0,
        savedPurchase.purchaseDate,
        savedPurchase,
      );

      const result = await purchaseRepo.findOne({
        where: { id: savedPurchase.id },
        relations: ['item', 'shop', 'seller'],
      });
      if (!result) {
        throw new BadRequestException('Failed to reload purchase after creation');
      }
      return result;
    };

    if (manager) {
      return run(manager);
    }
    return this.dataSource.transaction(run);
  }

  async findAll(filterDto?: FilterDto & { itemId?: number; shopId?: number; sellerId?: number }) {
    const queryBuilder = this.purchasesRepository.createQueryBuilder('purchase')
      .leftJoinAndSelect('purchase.item', 'item')
      .leftJoinAndSelect('purchase.seller', 'seller')
      .where('purchase.is_archived = :archived', { archived: false });
    applyTenantScope(queryBuilder, 'purchase');
    applyShopScope(queryBuilder, 'purchase', filterDto?.shopId);
    this.applyListFilters(queryBuilder, filterDto);
    queryBuilder.orderBy('purchase.createdAt', 'DESC');
    return paginateQuery(queryBuilder, filterDto);
  }

  async findOne(id: number): Promise<Purchase | null> {
    const purchase = await this.purchasesRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['item', 'shop', 'seller'],
    });
    if (!purchase || !canAccessOptionalShopRecord(purchase.shop?.id)) {
      return null;
    }
    return purchase;
  }

  async update(id: number, updatePurchaseDto: UpdatePurchaseDto): Promise<Purchase | null> {
    return this.dataSource.transaction(async (em) => {
      const purchaseRepo = em.getRepository(Purchase);
      const purchase = await purchaseRepo.findOne({
        where: tenantWhere({ id, is_archived: false }),
        relations: ['item', 'shop', 'seller'],
      });

      if (!purchase || !canAccessOptionalShopRecord(purchase.shop?.id)) {
        return null;
      }

      if (updatePurchaseDto.itemId !== undefined && updatePurchaseDto.itemId !== purchase.item.id) {
        throw new BadRequestException('Cannot change the item on an existing purchase. Delete it and create a new one.');
      }

      if (updatePurchaseDto.purchasePrice !== undefined) {
        purchase.purchasePrice = updatePurchaseDto.purchasePrice;
        await this.fifoService.adjustPurchaseCost(em, purchase.id, Number(updatePurchaseDto.purchasePrice) || 0);
      }

      if (updatePurchaseDto.quantity !== undefined) {
        purchase.quantity = updatePurchaseDto.quantity;
        await this.fifoService.adjustPurchaseQuantity(em, purchase.id, updatePurchaseDto.quantity);
      }

      if (updatePurchaseDto.purchaseDate !== undefined) {
        purchase.purchaseDate = new Date(updatePurchaseDto.purchaseDate);
      }

      if (updatePurchaseDto.newSeller?.name?.trim()) {
        purchase.seller = await this.sellersService.resolveForShop(
          purchase.shop?.id,
          undefined,
          updatePurchaseDto.newSeller,
          em,
        );
      } else if (updatePurchaseDto.sellerId !== undefined) {
        purchase.seller = updatePurchaseDto.sellerId
          ? await this.sellersService.resolveForShop(purchase.shop?.id, updatePurchaseDto.sellerId, undefined, em)
          : null;
      }

      return purchaseRepo.save(purchase);
    });
  }

  async remove(id: number): Promise<boolean> {
    return this.dataSource.transaction(async (em) => {
      const purchaseRepo = em.getRepository(Purchase);
      const purchase = await purchaseRepo.findOne({
        where: tenantWhere({ id, is_archived: false }),
        relations: ['shop'],
      });

      if (!purchase || !canAccessOptionalShopRecord(purchase.shop?.id)) {
        return false;
      }

      await this.fifoService.removePurchaseStock(em, purchase.id);
      purchase.is_archived = true;
      await purchaseRepo.save(purchase);
      return true;
    });
  }

  async getTotal(filterDto?: FilterDto & { itemId?: number; shopId?: number; sellerId?: number }): Promise<number> {
    let queryBuilder = this.purchasesRepository.createQueryBuilder('purchase')
      .leftJoin('purchase.item', 'item')
      .leftJoin('purchase.seller', 'seller')
      .where('purchase.is_archived = :archived', { archived: false });
    applyTenantScope(queryBuilder, 'purchase');
    applyShopScope(queryBuilder, 'purchase', filterDto?.shopId);
    this.applyListFilters(queryBuilder, filterDto);

    const result = await queryBuilder
      .select('SUM(purchase.purchasePrice * purchase.quantity)', 'total')
      .getRawOne();

    return parseFloat(result?.total || '0') || 0;
  }

  private applyListFilters(
    queryBuilder: ReturnType<Repository<Purchase>['createQueryBuilder']>,
    filterDto?: FilterDto & { itemId?: number; shopId?: number; sellerId?: number },
  ) {
    if (filterDto?.itemId) {
      queryBuilder.andWhere('purchase.item_id = :itemId', { itemId: filterDto.itemId });
    }
    if (filterDto?.sellerId) {
      queryBuilder.andWhere('purchase.seller_id = :sellerId', { sellerId: filterDto.sellerId });
    }
    if (filterDto?.search?.trim() && !filterDto?.itemId) {
      const term = `%${filterDto.search.trim()}%`;
      queryBuilder.andWhere(
        '(item.name ILIKE :term OR item.uniqueIdentifier ILIKE :term OR seller.name ILIKE :term OR seller.phone ILIKE :term OR seller.cnic ILIKE :term)',
        { term },
      );
    }
    applyItemConditionFilter(queryBuilder, 'item', filterDto?.condition);

    if (filterDto?.date) {
      const date = new Date(filterDto.date);
      queryBuilder.andWhere('DATE(purchase.purchaseDate) = DATE(:date)', { date });
    } else {
      if (filterDto?.dateFrom) {
        queryBuilder.andWhere('DATE(purchase.purchaseDate) >= DATE(:dateFrom)', { dateFrom: filterDto.dateFrom });
      }
      if (filterDto?.dateTo) {
        queryBuilder.andWhere('DATE(purchase.purchaseDate) <= DATE(:dateTo)', { dateTo: filterDto.dateTo });
      }
    }
  }
}
