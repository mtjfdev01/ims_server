import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { Purchase } from './entities/purchase.entity';
import { Item } from '../items/entities/item.entity';
import { Shop } from '../shops/entities/shop.entity';
import { FilterDto } from '../common/filter.dto';
import { paginateWithFilters } from '../common/pagination.util';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase)
    private purchasesRepository: Repository<Purchase>,
    @InjectRepository(Item)
    private itemRepository: Repository<Item>,
    @InjectRepository(Shop)
    private shopRepository: Repository<Shop>,
  ) {}

  async create(createPurchaseDto: CreatePurchaseDto): Promise<Purchase> {
    const item = await this.itemRepository.findOne({
      where: { id: createPurchaseDto.itemId, is_archived: false },
    });

    if (!item) {
      throw new Error(`Item with ID ${createPurchaseDto.itemId} not found`);
    }

    const purchase = this.purchasesRepository.create({
      item: item,
      purchasePrice: createPurchaseDto.purchasePrice,
      quantity: createPurchaseDto.quantity || 1,
      purchaseDate: createPurchaseDto.purchaseDate ? new Date(createPurchaseDto.purchaseDate) : new Date(),
    });

    // Set shop if provided
    if (createPurchaseDto.shopId) {
      const shop = await this.shopRepository.findOne({
        where: { id: createPurchaseDto.shopId },
      });
      if (shop) {
        purchase.shop = shop;
      }
    }

    return this.purchasesRepository.save(purchase);
  }

  async findAll(filterDto?: FilterDto & { itemId?: number; shopId?: number }) {
    const baseWhere: any = { is_archived: false };

    // Filter by shop if provided
    if (filterDto?.shopId) {
      baseWhere.shop = { id: filterDto.shopId };
    }

    // Filter by item if provided
    if (filterDto?.itemId) {
      baseWhere.item = { id: filterDto.itemId };
    } else if (filterDto?.search) {
      // Fallback to search for item ID
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
    const purchase = await this.purchasesRepository.findOne({
      where: { id, is_archived: false },
      relations: ['item'],
    });

    if (!purchase) {
      return null;
    }

    if (updatePurchaseDto.itemId !== undefined) {
      const item = await this.itemRepository.findOne({
        where: { id: updatePurchaseDto.itemId, is_archived: false },
      });
      if (!item) {
        throw new Error(`Item with ID ${updatePurchaseDto.itemId} not found`);
      }
      purchase.item = item;
    }

    if (updatePurchaseDto.purchasePrice !== undefined) {
      purchase.purchasePrice = updatePurchaseDto.purchasePrice;
    }

    if (updatePurchaseDto.quantity !== undefined) {
      purchase.quantity = updatePurchaseDto.quantity;
    }

    if (updatePurchaseDto.purchaseDate !== undefined) {
      purchase.purchaseDate = new Date(updatePurchaseDto.purchaseDate);
    }

    return this.purchasesRepository.save(purchase);
  }

  async remove(id: number): Promise<boolean> {
    const purchase = await this.purchasesRepository.findOne({
      where: { id, is_archived: false },
    });

    if (!purchase) {
      return false;
    }

    // Soft delete: mark as archived instead of deleting
    purchase.is_archived = true;
    await this.purchasesRepository.save(purchase);
    return true;
  }

  async getTotal(filterDto?: FilterDto & { itemId?: number }): Promise<number> {
    let queryBuilder = this.purchasesRepository.createQueryBuilder('purchase');
    let hasWhere = false;

    // Filter by item if provided
    if (filterDto?.itemId) {
      queryBuilder.where('purchase.item_id = :itemId', { itemId: filterDto.itemId });
      hasWhere = true;
    }

    // Apply date filters
    if (filterDto?.date) {
      const date = new Date(filterDto.date);
      if (hasWhere) {
        queryBuilder.andWhere('DATE(purchase.purchaseDate) = DATE(:date)', { date });
      } else {
        queryBuilder.where('DATE(purchase.purchaseDate) = DATE(:date)', { date });
        hasWhere = true;
      }
    } else {
      if (filterDto?.dateFrom) {
        if (hasWhere) {
          queryBuilder.andWhere('DATE(purchase.purchaseDate) >= DATE(:dateFrom)', { dateFrom: filterDto.dateFrom });
        } else {
          queryBuilder.where('DATE(purchase.purchaseDate) >= DATE(:dateFrom)', { dateFrom: filterDto.dateFrom });
          hasWhere = true;
        }
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
