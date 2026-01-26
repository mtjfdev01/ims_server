import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { Sale } from './entities/sale.entity';
import { SaleItem } from '../sale-items/entities/sale-item.entity';
import { Item } from '../items/entities/item.entity';
import { Shop } from '../shops/entities/shop.entity';
import { FilterDto } from '../common/filter.dto';
import { paginateWithFilters } from '../common/pagination.util';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private salesRepository: Repository<Sale>,
    @InjectRepository(SaleItem)
    private saleItemRepository: Repository<SaleItem>,
    @InjectRepository(Item)
    private itemRepository: Repository<Item>,
    @InjectRepository(Shop)
    private shopRepository: Repository<Shop>,
  ) {}

  async create(createSaleDto: CreateSaleDto): Promise<Sale> {
    if (!createSaleDto.items || createSaleDto.items.length === 0) {
      throw new Error('Sale must have at least one item');
    }

    // Validate all items and quantities before processing
    const itemValidations = await Promise.all(
      createSaleDto.items.map(async (saleItemDto) => {
        const item = await this.itemRepository.findOne({
          where: { id: saleItemDto.itemId, is_archived: false },
        });

        if (!item) {
          throw new Error(`Item with ID ${saleItemDto.itemId} not found`);
        }

        if (saleItemDto.quantity <= 0) {
          throw new Error(`Sale quantity must be greater than 0 for item ${item.name || item.id}`);
        }

        if (item.quantity < saleItemDto.quantity) {
          throw new Error(
            `Insufficient quantity for item ${item.name || item.id}. Available: ${item.quantity}, Requested: ${saleItemDto.quantity}`
          );
        }

        return { item, saleItemDto };
      })
    );

    // Calculate totals
    let totalAmount = 0;
    let totalProfit = 0;

    // Create sale with sale items
    const sale = this.salesRepository.create({
      totalAmount: 0,
      totalProfit: 0,
    });

    // Set shop if provided
    if (createSaleDto.shopId) {
      const shop = await this.shopRepository.findOne({
        where: { id: createSaleDto.shopId },
      });
      if (shop) {
        sale.shop = shop;
      }
    }

    const savedSale = await this.salesRepository.save(sale);

    // Create sale items and update item quantities
    const saleItems: SaleItem[] = [];
    for (const { item, saleItemDto } of itemValidations) {
      // Create sale item
      const saleItem = this.saleItemRepository.create({
        sale: savedSale,
        item: item,
        quantity: saleItemDto.quantity,
        profit: saleItemDto.profit,
        amount: saleItemDto.amount,
      });

      const savedSaleItem = await this.saleItemRepository.save(saleItem);
      saleItems.push(savedSaleItem);

      // Decrement item quantity
      item.quantity = item.quantity - saleItemDto.quantity;
      await this.itemRepository.save(item);

      // Accumulate totals
      totalAmount += saleItemDto.amount;
      totalProfit += saleItemDto.profit;
    }

    // Update sale with totals
    savedSale.totalAmount = totalAmount;
    savedSale.totalProfit = totalProfit;
    await this.salesRepository.save(savedSale);

    // Reload with relations
    const result = await this.salesRepository.findOne({
      where: { id: savedSale.id, is_archived: false },
      relations: ['saleItems', 'saleItems.item'],
    });
    if (!result) {
      throw new Error('Failed to reload sale after creation');
    }
    return result;
  }

  async findAll(filterDto?: FilterDto, shopId?: number) {
    const baseWhere: any = { is_archived: false };
    if (shopId) {
      baseWhere.shop = { id: shopId };
    }
    if (filterDto && (filterDto.page || filterDto.limit || filterDto.date || filterDto.dateFrom || filterDto.dateTo)) {
      return paginateWithFilters(
        this.salesRepository,
        filterDto,
        baseWhere,
        ['saleItems', 'saleItems.item'],
        { dateField: 'createdAt' }
      );
    }
    return this.salesRepository.find({
      where: baseWhere,
      relations: ['saleItems', 'saleItems.item'],
    });
  }

  async findByShop(shopId: number, filterDto?: FilterDto) {
    // Get all items that belong to this shop
    const shopItems = await this.itemRepository.find({
      where: { shop: { id: shopId }, is_archived: false },
      select: ['id'],
    });

    const itemIds = shopItems.map(item => item.id);

    if (itemIds.length === 0) {
      return filterDto && (filterDto.page || filterDto.limit) 
        ? { data: [], total: 0, page: 1, limit: 10, totalPages: 0 }
        : [];
    }

    // Find sales that have items from this shop
    // We need to find sales where at least one saleItem has an item from this shop
    const salesWithShopItems = await this.salesRepository
      .createQueryBuilder('sale')
      .innerJoin('sale.saleItems', 'saleItem')
      .innerJoin('saleItem.item', 'item')
      .where('item.id IN (:...itemIds)', { itemIds })
      .andWhere('sale.is_archived = :archived', { archived: false })
      .getMany();

    const saleIds = salesWithShopItems.map(s => s.id);

    if (saleIds.length === 0) {
      return filterDto && (filterDto.page || filterDto.limit) 
        ? { data: [], total: 0, page: 1, limit: 10, totalPages: 0 }
        : [];
    }

    // Build base where condition
    const baseWhere = { id: In(saleIds), is_archived: false } as any;

    if (filterDto && (filterDto.page || filterDto.limit || filterDto.date || filterDto.dateFrom || filterDto.dateTo)) {
      return paginateWithFilters(
        this.salesRepository,
        filterDto,
        baseWhere,
        ['saleItems', 'saleItems.item'],
        { dateField: 'createdAt' }
      );
    }

    return this.salesRepository.find({
      where: baseWhere,
      relations: ['saleItems', 'saleItems.item'],
    });
  }

  findOne(id: number): Promise<Sale | null> {
    return this.salesRepository.findOne({
      where: { id, is_archived: false },
      relations: ['saleItems', 'saleItems.item'],
    });
  }

  async update(id: number, updateSaleDto: UpdateSaleDto): Promise<Sale | null> {
    const existingSale = await this.salesRepository.findOne({
      where: { id, is_archived: false },
      relations: ['saleItems', 'saleItems.item'],
    });

    if (!existingSale) {
      return null;
    }

    // If items are being updated
    if (updateSaleDto.items !== undefined) {
      if (updateSaleDto.items.length === 0) {
        throw new Error('Sale must have at least one item');
      }

      // Restore quantities from existing sale items
      for (const existingSaleItem of existingSale.saleItems) {
        const item = await this.itemRepository.findOne({
          where: { id: existingSaleItem.item.id, is_archived: false },
        });
        if (item) {
          item.quantity = item.quantity + existingSaleItem.quantity;
          await this.itemRepository.save(item);
        }
      }

      // Delete existing sale items
      await this.saleItemRepository.delete({ sale: { id } });

      // Validate new items and quantities
      const itemValidations = await Promise.all(
        updateSaleDto.items.map(async (saleItemDto) => {
          const item = await this.itemRepository.findOne({
            where: { id: saleItemDto.itemId, is_archived: false },
          });

          if (!item) {
            throw new Error(`Item with ID ${saleItemDto.itemId} not found`);
          }

          if (saleItemDto.quantity <= 0) {
            throw new Error(`Sale quantity must be greater than 0 for item ${item.name || item.id}`);
          }

          if (item.quantity < saleItemDto.quantity) {
            throw new Error(
              `Insufficient quantity for item ${item.name || item.id}. Available: ${item.quantity}, Requested: ${saleItemDto.quantity}`
            );
          }

          return { item, saleItemDto };
        })
      );

      // Create new sale items and update quantities
      let totalAmount = 0;
      let totalProfit = 0;

      for (const { item, saleItemDto } of itemValidations) {
        const saleItem = this.saleItemRepository.create({
          sale: existingSale,
          item: item,
          quantity: saleItemDto.quantity,
          profit: saleItemDto.profit,
          amount: saleItemDto.amount,
        });

        await this.saleItemRepository.save(saleItem);

        // Decrement item quantity
        item.quantity = item.quantity - saleItemDto.quantity;
        await this.itemRepository.save(item);

        totalAmount += saleItemDto.amount;
        totalProfit += saleItemDto.profit;
      }

      // Update sale totals
      existingSale.totalAmount = totalAmount;
      existingSale.totalProfit = totalProfit;
      await this.salesRepository.save(existingSale);
    }

    return this.findOne(id);
  }

  async remove(id: number): Promise<boolean> {
    const sale = await this.salesRepository.findOne({
      where: { id },
      relations: ['saleItems', 'saleItems.item'],
    });

    if (!sale) {
      return false;
    }

    // Restore quantities for all items in the sale
    for (const saleItem of sale.saleItems) {
      const item = await this.itemRepository.findOne({
        where: { id: saleItem.item.id },
      });
      if (item) {
        item.quantity = item.quantity + saleItem.quantity;
        await this.itemRepository.save(item);
      }
    }

    // Delete the sale (cascade will delete sale items)
    const result = await this.salesRepository.delete(id);
    return (result.affected ?? 0) > 0;
  }

  async getTotals(filterDto?: FilterDto, shopId?: number): Promise<{ totalAmount: number; totalProfit: number }> {
    let queryBuilder = this.salesRepository.createQueryBuilder('sale')
      .where('sale.is_archived = :archived', { archived: false });
    let hasWhere = true;

    // Apply shop filter if provided
    if (shopId) {
      const shopItems = await this.itemRepository.find({
        where: { shop: { id: shopId }, is_archived: false },
        select: ['id'],
      });
      const itemIds = shopItems.map(item => item.id);
      
      if (itemIds.length > 0) {
        queryBuilder
          .innerJoin('sale.saleItems', 'saleItem')
          .innerJoin('saleItem.item', 'item')
          .andWhere('item.id IN (:...itemIds)', { itemIds });
      } else {
        return { totalAmount: 0, totalProfit: 0 };
      }
    }

    // Apply date filters
    if (filterDto?.date) {
      const date = new Date(filterDto.date);
      queryBuilder.andWhere('DATE(sale.createdAt) = DATE(:date)', { date });
    } else {
      if (filterDto?.dateFrom) {
        queryBuilder.andWhere('DATE(sale.createdAt) >= DATE(:dateFrom)', { dateFrom: filterDto.dateFrom });
      }
      if (filterDto?.dateTo) {
        queryBuilder.andWhere('DATE(sale.createdAt) <= DATE(:dateTo)', { dateTo: filterDto.dateTo });
      }
    }

    const result = await queryBuilder
      .select('SUM(sale.totalAmount)', 'totalAmount')
      .addSelect('SUM(sale.totalProfit)', 'totalProfit')
      .getRawOne();

    return {
      totalAmount: parseFloat(result?.totalAmount || '0') || 0,
      totalProfit: parseFloat(result?.totalProfit || '0') || 0,
    };
  }
}
