import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { Purchase } from './entities/purchase.entity';
import { Item } from '../items/entities/item.entity';
import { Shop } from '../shops/entities/shop.entity';
import { FilterDto } from '../common/filter.dto';
import { paginateWithFilters } from '../common/pagination.util';
import { FifoService } from '../stock-lots/fifo.service';

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
    private dataSource: DataSource,
  ) {}

  async create(createPurchaseDto: CreatePurchaseDto, manager?: EntityManager): Promise<Purchase> {
    const run = async (em: EntityManager) => {
      const itemRepo = em.getRepository(Item);
      const shopRepo = em.getRepository(Shop);
      const purchaseRepo = em.getRepository(Purchase);

      const item = await itemRepo.findOne({
        where: { id: createPurchaseDto.itemId, is_archived: false },
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

      const shopId = createPurchaseDto.shopId || item.shop?.id;
      if (shopId) {
        const shop = await shopRepo.findOne({ where: { id: shopId } });
        if (shop) {
          purchase.shop = shop;
        }
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
        relations: ['item', 'shop'],
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

  async findAll(filterDto?: FilterDto & { itemId?: number; shopId?: number }) {
    const baseWhere: any = { is_archived: false };

    if (filterDto?.shopId) {
      baseWhere.shop = { id: filterDto.shopId };
    }

    if (filterDto?.itemId) {
      baseWhere.item = { id: filterDto.itemId };
    } else if (filterDto?.search) {
      const itemId = parseInt(filterDto.search);
      if (!isNaN(itemId)) {
        baseWhere.item = { id: itemId };
      }
    }

    if (filterDto && (filterDto.page || filterDto.limit || filterDto.date || filterDto.dateFrom || filterDto.dateTo)) {
      return paginateWithFilters(
        this.purchasesRepository,
        filterDto,
        baseWhere,
        ['item'],
        { dateField: 'purchaseDate' }
      );
    }
    return this.purchasesRepository.find({
      relations: ['item'],
      where: { ...baseWhere, is_archived: false },
    });
  }

  findOne(id: number): Promise<Purchase | null> {
    return this.purchasesRepository.findOne({
      where: { id, is_archived: false },
      relations: ['item'],
    });
  }

  async update(id: number, updatePurchaseDto: UpdatePurchaseDto): Promise<Purchase | null> {
    return this.dataSource.transaction(async (em) => {
      const purchaseRepo = em.getRepository(Purchase);
      const purchase = await purchaseRepo.findOne({
        where: { id, is_archived: false },
        relations: ['item'],
      });

      if (!purchase) {
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

      return purchaseRepo.save(purchase);
    });
  }

  async remove(id: number): Promise<boolean> {
    return this.dataSource.transaction(async (em) => {
      const purchaseRepo = em.getRepository(Purchase);
      const purchase = await purchaseRepo.findOne({
        where: { id, is_archived: false },
      });

      if (!purchase) {
        return false;
      }

      await this.fifoService.removePurchaseStock(em, purchase.id);
      purchase.is_archived = true;
      await purchaseRepo.save(purchase);
      return true;
    });
  }

  async getTotal(filterDto?: FilterDto & { itemId?: number; shopId?: number }): Promise<number> {
    let queryBuilder = this.purchasesRepository.createQueryBuilder('purchase')
      .where('purchase.is_archived = :archived', { archived: false });

    if (filterDto?.shopId) {
      queryBuilder.andWhere('purchase.shop_id = :shopId', { shopId: filterDto.shopId });
    }

    if (filterDto?.itemId) {
      queryBuilder.andWhere('purchase.item_id = :itemId', { itemId: filterDto.itemId });
    }

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

    const result = await queryBuilder
      .select('SUM(purchase.purchasePrice * purchase.quantity)', 'total')
      .getRawOne();

    return parseFloat(result?.total || '0') || 0;
  }
}
