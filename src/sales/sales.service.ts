import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { Sale } from './entities/sale.entity';
import { SaleItem } from '../sale-items/entities/sale-item.entity';
import { Item } from '../items/entities/item.entity';
import { Shop } from '../shops/entities/shop.entity';
import { SalePayment } from '../sale-payments/entities/sale-payment.entity';
import { CreateSalePaymentDto } from '../sale-payments/dto/create-sale-payment.dto';
import { FilterDto } from '../common/filter.dto';
import { FifoService } from '../stock-lots/fifo.service';
import { CustomersService } from '../customers/customers.service';
import { applyShopScope, applyTenantScope, assertItemBelongsToShop, assertShopAccess, canAccessShopRecord, stampOwnership, tenantWhere } from '../common/access.util';
import {
  advanceDueDate,
  applyCreditTerms,
  derivePaymentStatus,
  InstallmentFrequency,
  money,
  presentCredit,
  remainingBalance,
  todayDate,
  toDateOnly,
  toIsoDate,
} from '../common/payment.util';

const SALE_RELATIONS = ['saleItems', 'saleItems.item', 'shop', 'customer', 'payments'];

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
    @InjectRepository(SalePayment)
    private salePaymentRepository: Repository<SalePayment>,
    private fifoService: FifoService,
    private customersService: CustomersService,
    private dataSource: DataSource,
  ) {}

  private present(sale: Sale | null): Sale | null {
    if (!sale) {
      return null;
    }
    return presentCredit(sale, sale.totalAmount);
  }

  private applyCreditTerms(sale: Sale, input: {
    amountPaid?: number;
    promiseDate?: string | null;
    installmentFrequency?: InstallmentFrequency;
    installmentAmount?: number | null;
  }): void {
    applyCreditTerms(sale, sale.totalAmount, input);
  }

  async create(createSaleDto: CreateSaleDto): Promise<Sale> {
    if (!createSaleDto.items || createSaleDto.items.length === 0) {
      throw new BadRequestException('Sale must have at least one item');
    }
    const shopId = createSaleDto.shopId;
    if (!shopId) {
      throw new BadRequestException('Shop is required');
    }

    return this.dataSource.transaction(async (em) => {
      const itemRepo = em.getRepository(Item);
      const shopRepo = em.getRepository(Shop);
      const saleRepo = em.getRepository(Sale);
      const saleItemRepo = em.getRepository(SaleItem);
      const paymentRepo = em.getRepository(SalePayment);

      const sale = saleRepo.create({
        totalAmount: 0,
        totalProfit: 0,
        paymentStatus: 'completed',
        installmentFrequency: 'none',
      });
      stampOwnership(sale);

      assertShopAccess(shopId);
      const shop = await shopRepo.findOne({
        where: tenantWhere({ id: shopId }),
      });
      if (!shop) {
        throw new BadRequestException('Shop not found');
      }
      sale.shop = shop;
      sale.customer = await this.customersService.resolveForShop(shopId, createSaleDto.customerId, createSaleDto.newCustomer, em);

      const savedSale = await saleRepo.save(sale);
      let totalAmount = 0;
      let totalProfit = 0;

      for (const saleItemDto of createSaleDto.items) {
        const item = await itemRepo.findOne({
          where: tenantWhere({ id: saleItemDto.itemId, is_archived: false }),
          relations: ['shop'],
        });
        if (!item) {
          throw new BadRequestException(`Item with ID ${saleItemDto.itemId} not found`);
        }
        assertItemBelongsToShop(item, shopId);
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
      this.applyCreditTerms(savedSale, {
        amountPaid: createSaleDto.amountPaid,
        promiseDate: createSaleDto.promiseDate,
        installmentFrequency: createSaleDto.installmentFrequency,
        installmentAmount: createSaleDto.installmentAmount,
      });
      await saleRepo.save(savedSale);

      const openingPaid = money(savedSale.amountPaid);
      if (openingPaid > 0) {
        const payment = paymentRepo.create({
          sale: savedSale,
          amount: openingPaid,
          paidOn: toIsoDate(todayDate()) as string,
          notes: 'Opening payment',
        });
        stampOwnership(payment);
        await paymentRepo.save(payment);
      }

      const created = this.present(await saleRepo.findOne({
        where: { id: savedSale.id, is_archived: false },
        relations: SALE_RELATIONS,
      }));
      if (!created) {
        throw new BadRequestException('Sale could not be loaded after create');
      }
      return created;
    });
  }

  private applyListFilters(queryBuilder: ReturnType<Repository<Sale>['createQueryBuilder']>, filterDto?: FilterDto) {
    if (filterDto?.date) {
      queryBuilder.andWhere('DATE(sale.createdAt) = DATE(:date)', { date: filterDto.date });
    } else {
      if (filterDto?.dateFrom) {
        queryBuilder.andWhere('DATE(sale.createdAt) >= DATE(:dateFrom)', { dateFrom: filterDto.dateFrom });
      }
      if (filterDto?.dateTo) {
        queryBuilder.andWhere('DATE(sale.createdAt) <= DATE(:dateTo)', { dateTo: filterDto.dateTo });
      }
    }
    if (filterDto?.paymentStatus) {
      queryBuilder.andWhere('sale.paymentStatus = :paymentStatus', { paymentStatus: filterDto.paymentStatus });
    }
    if (filterDto?.customerId) {
      queryBuilder.andWhere('sale.customer_id = :customerId', { customerId: Number(filterDto.customerId) });
    }
    if (filterDto?.dueToday === 'true' || filterDto?.dueToday === '1') {
      const today = toIsoDate(todayDate());
      queryBuilder.andWhere('sale.paymentStatus != :paidStatus', { paidStatus: 'completed' });
      queryBuilder.andWhere('(sale.nextDueDate <= :today OR (sale.nextDueDate IS NULL AND sale.promiseDate <= :today))', { today });
    }
    if (filterDto?.search?.trim()) {
      const term = `%${filterDto.search.trim()}%`;
      queryBuilder.andWhere('(customer.name ILIKE :term OR customer.phone ILIKE :term OR customer.email ILIKE :term)', { term });
    }
  }

  async findAll(filterDto?: FilterDto, shopId?: number) {
    const queryBuilder = this.salesRepository.createQueryBuilder('sale')
      .leftJoinAndSelect('sale.saleItems', 'saleItems')
      .leftJoinAndSelect('saleItems.item', 'item')
      .leftJoinAndSelect('sale.shop', 'shop')
      .leftJoinAndSelect('sale.customer', 'customer')
      .where('sale.is_archived = :archived', { archived: false });
    applyTenantScope(queryBuilder, 'sale');
    applyShopScope(queryBuilder, 'sale', shopId);
    this.applyListFilters(queryBuilder, filterDto);
    queryBuilder.orderBy('sale.createdAt', 'DESC');

    const page = filterDto?.page ? Number(filterDto.page) : undefined;
    const limit = filterDto?.limit ? Number(filterDto.limit) : undefined;
    if (page && limit) {
      const total = await queryBuilder.getCount();
      queryBuilder.skip((page - 1) * limit).take(limit);
      const data = (await queryBuilder.getMany()).map(sale => this.present(sale));
      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      };
    }

    const sales = await queryBuilder.getMany();
    return sales.map(sale => this.present(sale));
  }

  async findOne(id: number): Promise<Sale | null> {
    const sale = await this.salesRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: SALE_RELATIONS,
    });
    if (!sale || !canAccessShopRecord(sale.shop?.id)) {
      return null;
    }
    return this.present(sale);
  }

  async update(id: number, updateSaleDto: UpdateSaleDto): Promise<Sale | null> {
    return this.dataSource.transaction(async (em) => {
      const saleRepo = em.getRepository(Sale);
      const saleItemRepo = em.getRepository(SaleItem);
      const itemRepo = em.getRepository(Item);

      const existingSale = await saleRepo.findOne({
        where: tenantWhere({ id, is_archived: false }),
        relations: ['saleItems', 'saleItems.item', 'order', 'shop', 'customer'],
      });

      if (!existingSale || !canAccessShopRecord(existingSale.shop?.id)) {
        return null;
      }

      const previousPaid = existingSale.amountPaid == null
        ? money(existingSale.totalAmount)
        : money(existingSale.amountPaid);

      if (existingSale.order && updateSaleDto.items !== undefined) {
        throw new BadRequestException('Cannot edit a sale that was created from a completed order');
      }

      if (updateSaleDto.items !== undefined) {
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
            where: tenantWhere({ id: saleItemDto.itemId, is_archived: false }),
            relations: ['shop'],
          });
          if (!item) {
            throw new BadRequestException(`Item with ID ${saleItemDto.itemId} not found`);
          }
          if (existingSale.shop?.id) {
            assertItemBelongsToShop(item, existingSale.shop.id);
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
      }

      if (updateSaleDto.customerId !== undefined) {
        existingSale.customer = updateSaleDto.customerId
          ? await this.customersService.resolveForShop(existingSale.shop?.id as number, updateSaleDto.customerId, undefined, em)
          : null;
      }

      const paymentTouched = (
        updateSaleDto.amountPaid !== undefined ||
        updateSaleDto.promiseDate !== undefined ||
        updateSaleDto.installmentFrequency !== undefined ||
        updateSaleDto.installmentAmount !== undefined
      );
      if (paymentTouched) {
        this.applyCreditTerms(existingSale, {
          amountPaid: updateSaleDto.amountPaid,
          promiseDate: updateSaleDto.promiseDate,
          installmentFrequency: updateSaleDto.installmentFrequency,
          installmentAmount: updateSaleDto.installmentAmount,
        });
      } else if (updateSaleDto.items !== undefined) {
        const total = money(existingSale.totalAmount);
        const paid = existingSale.amountPaid == null ? total : Math.min(money(existingSale.amountPaid), total);
        existingSale.amountPaid = paid;
        existingSale.paymentStatus = derivePaymentStatus(total, paid);
        if (existingSale.paymentStatus === 'completed') {
          existingSale.nextDueDate = null;
          existingSale.promiseDate = null;
          existingSale.installmentFrequency = 'none';
          existingSale.installmentAmount = null;
        }
      }

      await saleRepo.save(existingSale);

      const nextPaid = existingSale.amountPaid == null
        ? money(existingSale.totalAmount)
        : money(existingSale.amountPaid);
      const paidDelta = money(nextPaid - previousPaid);
      if (Math.abs(paidDelta) > 0.001) {
        const paymentRepo = em.getRepository(SalePayment);
        const payment = paymentRepo.create({
          sale: existingSale,
          amount: paidDelta,
          paidOn: toIsoDate(todayDate()) as string,
          notes: paidDelta > 0 ? 'Payment adjustment' : 'Payment correction',
        });
        stampOwnership(payment);
        await paymentRepo.save(payment);
      }

      return this.present(await saleRepo.findOne({
        where: { id, is_archived: false },
        relations: SALE_RELATIONS,
      }));
    });
  }

  async addPayment(id: number, dto: CreateSalePaymentDto): Promise<Sale | null> {
    return this.dataSource.transaction(async (em) => {
      const saleRepo = em.getRepository(Sale);
      const paymentRepo = em.getRepository(SalePayment);
      const sale = await saleRepo.findOne({
        where: tenantWhere({ id, is_archived: false }),
        relations: ['shop'],
      });
      if (!sale || !canAccessShopRecord(sale.shop?.id)) {
        return null;
      }

      const total = money(sale.totalAmount);
      const currentPaid = sale.amountPaid == null ? total : money(sale.amountPaid);
      const incoming = money(dto.amount);
      if (incoming <= 0) {
        throw new BadRequestException('Payment amount must be greater than 0');
      }
      const remaining = remainingBalance(total, currentPaid);
      if (incoming > remaining + 0.001) {
        throw new BadRequestException(`Payment exceeds remaining balance of ${remaining.toFixed(2)}`);
      }

      const payment = paymentRepo.create({
        sale,
        amount: incoming,
        paidOn: dto.paidOn || (toIsoDate(todayDate()) as string),
        notes: dto.notes?.trim() || null,
      });
      stampOwnership(payment);
      await paymentRepo.save(payment);

      const nextPaid = money(currentPaid + incoming);
      const status = derivePaymentStatus(total, nextPaid);
      sale.amountPaid = nextPaid;
      sale.paymentStatus = status;
      if (status === 'completed') {
        sale.nextDueDate = null;
        sale.promiseDate = null;
        sale.installmentFrequency = 'none';
        sale.installmentAmount = null;
      } else if (sale.installmentFrequency && sale.installmentFrequency !== 'none') {
        const from = toDateOnly(sale.nextDueDate) || todayDate();
        sale.nextDueDate = toIsoDate(advanceDueDate(from, sale.installmentFrequency));
      }
      await saleRepo.save(sale);
      return this.findOne(id);
    });
  }

  async remove(id: number): Promise<boolean> {
    return this.dataSource.transaction(async (em) => {
      const saleRepo = em.getRepository(Sale);
      const sale = await saleRepo.findOne({
        where: tenantWhere({ id, is_archived: false }),
        relations: ['saleItems', 'saleItems.item', 'order', 'shop'],
      });

      if (!sale || !canAccessShopRecord(sale.shop?.id)) {
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

  async getTotals(filterDto?: FilterDto, shopId?: number): Promise<{ totalAmount: number; totalProfit: number; outstanding: number }> {
    const queryBuilder = this.salesRepository.createQueryBuilder('sale')
      .leftJoin('sale.customer', 'customer')
      .where('sale.is_archived = :archived', { archived: false });
    applyTenantScope(queryBuilder, 'sale');
    applyShopScope(queryBuilder, 'sale', shopId);
    this.applyListFilters(queryBuilder, filterDto);

    const result = await queryBuilder
      .select('SUM(sale.totalAmount)', 'totalAmount')
      .addSelect('SUM(sale.totalProfit)', 'totalProfit')
      .addSelect('SUM(CASE WHEN sale.amountPaid IS NULL THEN 0 ELSE sale.totalAmount - sale.amountPaid END)', 'outstanding')
      .getRawOne();

    return {
      totalAmount: parseFloat(result?.totalAmount || '0') || 0,
      totalProfit: parseFloat(result?.totalProfit || '0') || 0,
      outstanding: Math.max(0, parseFloat(result?.outstanding || '0') || 0),
    };
  }
}
