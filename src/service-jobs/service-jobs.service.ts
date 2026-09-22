import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ServiceJob } from './entities/service-job.entity';
import { ServicePayment } from '../service-payments/entities/service-payment.entity';
import { Shop } from '../shops/entities/shop.entity';
import { CreateServiceJobDto } from './dto/create-service-job.dto';
import { UpdateServiceJobDto } from './dto/update-service-job.dto';
import { CreateServicePaymentDto } from '../service-payments/dto/create-service-payment.dto';
import { FilterDto } from '../common/filter.dto';
import { CustomersService } from '../customers/customers.service';
import { applyShopScope, applyTenantScope, assertShopAccess, canAccessShopRecord, stampOwnership, tenantWhere } from '../common/access.util';
import {
  advanceDueDate,
  applyCreditTerms,
  derivePaymentStatus,
  money,
  presentCredit,
  remainingBalance,
  todayDate,
  toDateOnly,
  toIsoDate,
} from '../common/payment.util';

const RELATIONS = ['shop', 'customer', 'payments'];

@Injectable()
export class ServiceJobsService {
  constructor(
    @InjectRepository(ServiceJob)
    private jobsRepository: Repository<ServiceJob>,
    private customersService: CustomersService,
    private dataSource: DataSource,
  ) {}

  private present(job: ServiceJob | null): ServiceJob | null {
    if (!job) {
      return null;
    }
    job.profit = money(job.amount);
    return presentCredit(job, job.amount);
  }

  private applyListFilters(queryBuilder: ReturnType<Repository<ServiceJob>['createQueryBuilder']>, filterDto?: FilterDto) {
    if (filterDto?.date) {
      queryBuilder.andWhere('DATE(job.createdAt) = DATE(:date)', { date: filterDto.date });
    } else {
      if (filterDto?.dateFrom) {
        queryBuilder.andWhere('DATE(job.createdAt) >= DATE(:dateFrom)', { dateFrom: filterDto.dateFrom });
      }
      if (filterDto?.dateTo) {
        queryBuilder.andWhere('DATE(job.createdAt) <= DATE(:dateTo)', { dateTo: filterDto.dateTo });
      }
    }
    if (filterDto?.paymentStatus) {
      queryBuilder.andWhere('job.paymentStatus = :paymentStatus', { paymentStatus: filterDto.paymentStatus });
    }
    if (filterDto?.customerId) {
      queryBuilder.andWhere('job.customer_id = :customerId', { customerId: Number(filterDto.customerId) });
    }
    if (filterDto?.kind?.trim()) {
      queryBuilder.andWhere('job.kind ILIKE :kind', { kind: `%${filterDto.kind.trim()}%` });
    }
    if (filterDto?.dueToday === 'true' || filterDto?.dueToday === '1') {
      const today = toIsoDate(todayDate());
      queryBuilder.andWhere('job.paymentStatus != :paidStatus', { paidStatus: 'completed' });
      queryBuilder.andWhere('(job.nextDueDate <= :today OR (job.nextDueDate IS NULL AND job.promiseDate <= :today))', { today });
    }
    if (filterDto?.search?.trim()) {
      const term = `%${filterDto.search.trim()}%`;
      queryBuilder.andWhere('(job.title ILIKE :term OR job.kind ILIKE :term OR customer.name ILIKE :term OR customer.phone ILIKE :term)', { term });
    }
  }

  async create(dto: CreateServiceJobDto): Promise<ServiceJob> {
    const shopId = dto.shopId;
    if (!shopId) {
      throw new BadRequestException('Shop is required');
    }
    const amount = money(dto.amount);
    if (amount <= 0) {
      throw new BadRequestException('Service amount must be greater than 0');
    }

    return this.dataSource.transaction(async (em) => {
      const jobRepo = em.getRepository(ServiceJob);
      const shopRepo = em.getRepository(Shop);
      const paymentRepo = em.getRepository(ServicePayment);

      assertShopAccess(shopId);
      const shop = await shopRepo.findOne({ where: tenantWhere({ id: shopId }) });
      if (!shop) {
        throw new BadRequestException('Shop not found');
      }
      const job = jobRepo.create({
        title: dto.title.trim(),
        kind: (dto.kind || 'other').trim().slice(0, 80) || 'other',
        notes: dto.notes?.trim() || null,
        amount,
        profit: amount,
        paymentStatus: 'completed',
        installmentFrequency: 'none',
      });
      stampOwnership(job);
      job.shop = shop;
      job.customer = await this.customersService.resolveForShop(shopId, dto.customerId, dto.newCustomer, em);
      applyCreditTerms(job, amount, {
        amountPaid: dto.amountPaid,
        promiseDate: dto.promiseDate,
        installmentFrequency: dto.installmentFrequency,
        installmentAmount: dto.installmentAmount,
      });
      const saved = await jobRepo.save(job);

      const openingPaid = money(saved.amountPaid);
      if (openingPaid > 0) {
        const payment = paymentRepo.create({
          serviceJob: saved,
          amount: openingPaid,
          paidOn: toIsoDate(todayDate()) as string,
          notes: 'Opening payment',
        });
        stampOwnership(payment);
        await paymentRepo.save(payment);
      }

      const created = this.present(await jobRepo.findOne({
        where: { id: saved.id, is_archived: false },
        relations: RELATIONS,
      }));
      if (!created) {
        throw new BadRequestException('Service could not be loaded after create');
      }
      return created;
    });
  }

  async findAll(filterDto?: FilterDto, shopId?: number) {
    const queryBuilder = this.jobsRepository.createQueryBuilder('job')
      .leftJoinAndSelect('job.shop', 'shop')
      .leftJoinAndSelect('job.customer', 'customer')
      .where('job.is_archived = :archived', { archived: false });
    applyTenantScope(queryBuilder, 'job');
    applyShopScope(queryBuilder, 'job', shopId);
    this.applyListFilters(queryBuilder, filterDto);
    queryBuilder.orderBy('job.createdAt', 'DESC');

    const page = filterDto?.page ? Number(filterDto.page) : undefined;
    const limit = filterDto?.limit ? Number(filterDto.limit) : undefined;
    if (page && limit) {
      const total = await queryBuilder.getCount();
      queryBuilder.skip((page - 1) * limit).take(limit);
      const data = (await queryBuilder.getMany()).map(job => this.present(job));
      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      };
    }
    return (await queryBuilder.getMany()).map(job => this.present(job));
  }

  async findOne(id: number): Promise<ServiceJob | null> {
    const job = await this.jobsRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: RELATIONS,
    });
    if (!job || !canAccessShopRecord(job.shop?.id)) {
      return null;
    }
    return this.present(job);
  }

  async update(id: number, dto: UpdateServiceJobDto): Promise<ServiceJob | null> {
    return this.dataSource.transaction(async (em) => {
      const jobRepo = em.getRepository(ServiceJob);
      const job = await jobRepo.findOne({
        where: tenantWhere({ id, is_archived: false }),
        relations: ['shop', 'customer'],
      });
      if (!job || !canAccessShopRecord(job.shop?.id)) {
        return null;
      }

      const previousPaid = job.amountPaid == null ? money(job.amount) : money(job.amountPaid);
      if (dto.title !== undefined) {
        job.title = dto.title.trim();
      }
      if (dto.kind !== undefined) {
        job.kind = (dto.kind || 'other').trim().slice(0, 80) || 'other';
      }
      if (dto.notes !== undefined) {
        job.notes = dto.notes?.trim() || null;
      }
      if (dto.amount !== undefined) {
        const amount = money(dto.amount);
        if (amount <= 0) {
          throw new BadRequestException('Service amount must be greater than 0');
        }
        job.amount = amount;
        job.profit = amount;
      }
      if (dto.customerId !== undefined) {
        job.customer = dto.customerId
          ? await this.customersService.resolveForShop(job.shop?.id as number, dto.customerId, undefined, em)
          : null;
      }

      const paymentTouched = (
        dto.amountPaid !== undefined ||
        dto.promiseDate !== undefined ||
        dto.installmentFrequency !== undefined ||
        dto.installmentAmount !== undefined
      );
      if (paymentTouched) {
        applyCreditTerms(job, job.amount, {
          amountPaid: dto.amountPaid,
          promiseDate: dto.promiseDate,
          installmentFrequency: dto.installmentFrequency,
          installmentAmount: dto.installmentAmount,
        });
      } else if (dto.amount !== undefined) {
        const total = money(job.amount);
        const paid = job.amountPaid == null ? total : Math.min(money(job.amountPaid), total);
        job.amountPaid = paid;
        job.paymentStatus = derivePaymentStatus(total, paid);
        job.profit = total;
        if (job.paymentStatus === 'completed') {
          job.nextDueDate = null;
          job.promiseDate = null;
          job.installmentFrequency = 'none';
          job.installmentAmount = null;
        }
      }

      await jobRepo.save(job);
      const nextPaid = job.amountPaid == null ? money(job.amount) : money(job.amountPaid);
      const paidDelta = money(nextPaid - previousPaid);
      if (Math.abs(paidDelta) > 0.001) {
        const paymentRepo = em.getRepository(ServicePayment);
        const payment = paymentRepo.create({
          serviceJob: job,
          amount: paidDelta,
          paidOn: toIsoDate(todayDate()) as string,
          notes: paidDelta > 0 ? 'Payment adjustment' : 'Payment correction',
        });
        stampOwnership(payment);
        await paymentRepo.save(payment);
      }

      return this.present(await jobRepo.findOne({
        where: { id, is_archived: false },
        relations: RELATIONS,
      }));
    });
  }

  async addPayment(id: number, dto: CreateServicePaymentDto): Promise<ServiceJob | null> {
    return this.dataSource.transaction(async (em) => {
      const jobRepo = em.getRepository(ServiceJob);
      const paymentRepo = em.getRepository(ServicePayment);
      const job = await jobRepo.findOne({
        where: tenantWhere({ id, is_archived: false }),
        relations: ['shop'],
      });
      if (!job || !canAccessShopRecord(job.shop?.id)) {
        return null;
      }

      const total = money(job.amount);
      const currentPaid = job.amountPaid == null ? total : money(job.amountPaid);
      const incoming = money(dto.amount);
      if (incoming <= 0) {
        throw new BadRequestException('Payment amount must be greater than 0');
      }
      const remaining = remainingBalance(total, currentPaid);
      if (incoming > remaining + 0.001) {
        throw new BadRequestException(`Payment exceeds remaining balance of ${remaining.toFixed(2)}`);
      }

      const payment = paymentRepo.create({
        serviceJob: job,
        amount: incoming,
        paidOn: dto.paidOn || (toIsoDate(todayDate()) as string),
        notes: dto.notes?.trim() || null,
      });
      stampOwnership(payment);
      await paymentRepo.save(payment);

      const nextPaid = money(currentPaid + incoming);
      const status = derivePaymentStatus(total, nextPaid);
      job.amountPaid = nextPaid;
      job.paymentStatus = status;
      if (status === 'completed') {
        job.nextDueDate = null;
        job.promiseDate = null;
        job.installmentFrequency = 'none';
        job.installmentAmount = null;
      } else if (job.installmentFrequency && job.installmentFrequency !== 'none') {
        const from = toDateOnly(job.nextDueDate) || todayDate();
        job.nextDueDate = toIsoDate(advanceDueDate(from, job.installmentFrequency));
      }
      await jobRepo.save(job);
      return this.findOne(id);
    });
  }

  async remove(id: number): Promise<boolean> {
    const job = await this.jobsRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['shop'],
    });
    if (!job || !canAccessShopRecord(job.shop?.id)) {
      return false;
    }
    job.is_archived = true;
    await this.jobsRepository.save(job);
    return true;
  }

  async getTotals(filterDto?: FilterDto, shopId?: number): Promise<{ totalAmount: number; totalProfit: number; outstanding: number }> {
    const queryBuilder = this.jobsRepository.createQueryBuilder('job')
      .leftJoin('job.customer', 'customer')
      .where('job.is_archived = :archived', { archived: false });
    applyTenantScope(queryBuilder, 'job');
    applyShopScope(queryBuilder, 'job', shopId);
    this.applyListFilters(queryBuilder, filterDto);

    const result = await queryBuilder
      .select('SUM(job.amount)', 'totalAmount')
      .addSelect('SUM(job.profit)', 'totalProfit')
      .addSelect('SUM(CASE WHEN job.amountPaid IS NULL THEN 0 ELSE job.amount - job.amountPaid END)', 'outstanding')
      .getRawOne();

    return {
      totalAmount: parseFloat(result?.totalAmount || '0') || 0,
      totalProfit: parseFloat(result?.totalProfit || '0') || 0,
      outstanding: Math.max(0, parseFloat(result?.outstanding || '0') || 0),
    };
  }
}
