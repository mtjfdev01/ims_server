import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { Sale } from './entities/sale.entity';
import { SaleItem } from '../sale-items/entities/sale-item.entity';
import { Item } from '../items/entities/item.entity';
import { Shop } from '../shops/entities/shop.entity';
import { FilterDto } from '../common/filter.dto';
import { paginateWithFilters } from '../common/pagination.util';
import { FifoService } from '../stock-lots/fifo.service';

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
    private fifoService: FifoService,
    private dataSource: DataSource,
  ) {}

  async create(createSaleDto: CreateSaleDto): Promise<Sale> {
    if (!createSaleDto.items || createSaleDto.items.length === 0) {
      throw new BadRequestException('Sale must have at least one item');
    }

    return this.dataSource.transaction(async (em) => {
      const itemRepo = em.getRepository(Item);
      const shopRepo = em.getRepository(Shop);
      const saleRepo = em.getRepository(Sale);
      const saleItemRepo = em.getRepository(SaleItem);

      const sale = saleRepo.create({
        totalAmount: 0,
        totalProfit: 0,
      });

      if (createSaleDto.shopId) {
        const shop = await shopRepo.findOne({
          where: { id: createSaleDto.shopId },
        });
        if (shop) {
          sale.shop = shop;
        }
      }

      const savedSale = await saleRepo.save(sale);
      let totalAmount = 0;
      let totalProfit = 0;

      for (const saleItemDto of createSaleDto.items) {
        const item = await itemRepo.findOne({
          where: { id: saleItemDto.itemId, is_archived: false },
        });
        if (!item) {
          throw new BadRequestException(`Item with ID ${saleItemDto.itemId} not found`);
        }
        if (saleItemDto.quantity <= 0) {
          throw new BadRequestException(`Sale quantity must be greater than 0 for item ${item.name || item.id}`);
        }

        const saleItem = await saleItemRepo.save(saleItemRepo.create({
          sale: savedSale,
          item,
          quantity: saleItemDto.quantity,
          amount: saleItemDto.amount,
          profit: 0,
        }));

        const { cogs } = await this.fifoService.consume(em, item, saleItemDto.quantity, { saleItem });
        const profit = parseFloat((Number(saleItemDto.amount) - cogs).toFixed(2));
        saleItem.profit = profit;
        await saleItemRepo.save(saleItem);

        totalAmount += Number(saleItemDto.amount);
        totalProfit += profit;
      }

      savedSale.totalAmount = parseFloat(totalAmount.toFixed(2));
      savedSale.totalProfit = parseFloat(totalProfit.toFixed(2));
      await saleRepo.save(savedSale);

      const result = await saleRepo.findOne({
        where: { id: savedSale.id, is_archived: false },
        relations: ['saleItems', 'saleItems.item', 'shop'],
      });
      if (!result) {
        throw new BadRequestException('Failed to reload sale after creation');
      }
      return result;
    });
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

  findOne(id: number): Promise<Sale | null> {
    return this.salesRepository.findOne({
      where: { id, is_archived: false },
      relations: ['saleItems', 'saleItems.item', 'shop'],
    });
  }

  async update(id: number, updateSaleDto: UpdateSaleDto): Promise<Sale | null> {
    return this.dataSource.transaction(async (em) => {
      const saleRepo = em.getRepository(Sale);
      const saleItemRepo = em.getRepository(SaleItem);
      const itemRepo = em.getRepository(Item);

      const existingSale = await saleRepo.findOne({
        where: { id, is_archived: false },
        relations: ['saleItems', 'saleItems.item', 'order'],
      });

      if (!existingSale) {
        return null;
      }

      if (existingSale.order) {
        throw new BadRequestException('Cannot edit a sale that was created from a completed order');
      }

      if (updateSaleDto.items === undefined) {
        return this.findOne(id);
      }

      if (updateSaleDto.items.length === 0) {
        throw new BadRequestException('Sale must have at least one item');
      }

      for (const existingSaleItem of existingSale.saleItems) {
        await this.fifoService.restoreBySaleItem(em, existingSaleItem.id);
      }
      await saleItemRepo.delete({ sale: { id } });

      let totalAmount = 0;
      let totalProfit = 0;

      for (const saleItemDto of updateSaleDto.items) {
        const item = await itemRepo.findOne({
          where: { id: saleItemDto.itemId, is_archived: false },
        });
        if (!item) {
          throw new BadRequestException(`Item with ID ${saleItemDto.itemId} not found`);
        }
        if (saleItemDto.quantity <= 0) {
          throw new BadRequestException(`Sale quantity must be greater than 0 for item ${item.name || item.id}`);
        }

        const saleItem = await saleItemRepo.save(saleItemRepo.create({
          sale: existingSale,
          item,
          quantity: saleItemDto.quantity,
          amount: saleItemDto.amount,
          profit: 0,
        }));

        const { cogs } = await this.fifoService.consume(em, item, saleItemDto.quantity, { saleItem });
        const profit = parseFloat((Number(saleItemDto.amount) - cogs).toFixed(2));
        saleItem.profit = profit;
        await saleItemRepo.save(saleItem);

        totalAmount += Number(saleItemDto.amount);
        totalProfit += profit;
      }

      existingSale.totalAmount = parseFloat(totalAmount.toFixed(2));
      existingSale.totalProfit = parseFloat(totalProfit.toFixed(2));
      await saleRepo.save(existingSale);

      return saleRepo.findOne({
        where: { id, is_archived: false },
        relations: ['saleItems', 'saleItems.item', 'shop'],
      });
    });
  }

  async remove(id: number): Promise<boolean> {
    return this.dataSource.transaction(async (em) => {
      const saleRepo = em.getRepository(Sale);
      const sale = await saleRepo.findOne({
        where: { id, is_archived: false },
        relations: ['saleItems', 'saleItems.item', 'order'],
      });

      if (!sale) {
        return false;
      }

      if (!sale.order) {
        for (const saleItem of sale.saleItems) {
          await this.fifoService.restoreBySaleItem(em, saleItem.id);
        }
      }

      sale.is_archived = true;
      await saleRepo.save(sale);
      return true;
    });
  }

  async getTotals(filterDto?: FilterDto, shopId?: number): Promise<{ totalAmount: number; totalProfit: number }> {
    const queryBuilder = this.salesRepository.createQueryBuilder('sale')
      .where('sale.is_archived = :archived', { archived: false });

    if (shopId) {
      queryBuilder.andWhere('sale.shop_id = :shopId', { shopId });
    }

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
