import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InstallmentPlan } from './entities/installment-plan.entity';
import { InstallmentDue } from './entities/installment-due.entity';
import { Shop } from '../shops/entities/shop.entity';
import { CreateInstallmentPlanDto } from './dto/create-installment-plan.dto';
import { UpdateInstallmentPlanDto } from './dto/update-installment-plan.dto';
import { PayInstallmentDueDto } from './dto/pay-installment-due.dto';
import { FilterDto } from '../common/filter.dto';
import { CustomersService } from '../customers/customers.service';
import { applyShopScope, applyTenantScope, assertShopAccess, canAccessShopRecord, resolveTenantId, stampOwnership, tenantWhere } from '../common/access.util';
import {
  addDays,
  deriveDueStatus,
  derivePaymentStatus,
  endOfWeek,
  generateMonthlyDueDates,
  money,
  nextOnOrAfter,
  remainingBalance,
  splitInstallmentAmounts,
  startOfWeek,
  toDateOnly,
  todayDate,
  toIsoDate,
} from '../common/payment.util';

@Injectable()
export class InstallmentsService {
  constructor(
    @InjectRepository(InstallmentPlan)
    private plansRepository: Repository<InstallmentPlan>,
    @InjectRepository(InstallmentDue)
    private duesRepository: Repository<InstallmentDue>,
    private customersService: CustomersService,
    private dataSource: DataSource,
  ) {}

  private presentDue(due: InstallmentDue | null): InstallmentDue | null {
    if (!due) {
      return null;
    }
    due.paidAmount = money(due.paidAmount);
    due.amount = money(due.amount);
    due.status = deriveDueStatus(due.dueDate, due.amount, due.paidAmount);
    due.remaining = remainingBalance(due.amount, due.paidAmount);
    return due;
  }

  private presentPlan(plan: InstallmentPlan | null): InstallmentPlan | null {
    if (!plan) {
      return null;
    }
    plan.totalAmount = money(plan.totalAmount);
    plan.downPayment = money(plan.downPayment);
    plan.amountPaid = money(plan.amountPaid);
    plan.installmentAmount = money(plan.installmentAmount);
    plan.paymentStatus = derivePaymentStatus(plan.totalAmount, plan.amountPaid);
    plan.balance = remainingBalance(plan.totalAmount, plan.amountPaid);
    if (plan.dues) {
      plan.dues = plan.dues
        .filter(due => !due.is_archived)
        .map(due => this.presentDue(due) as InstallmentDue)
        .sort((a, b) => a.sequence - b.sequence);
      plan.completedCount = plan.dues.filter(due => due.status === 'completed').length;
      plan.pendingCount = plan.dues.filter(due => due.status === 'pending').length;
      plan.upcomingCount = plan.dues.filter(due => due.status === 'upcoming').length;
    }
    return plan;
  }

  private resolveSchedule(dto: CreateInstallmentPlanDto): { dayOfMonth: number; firstDueDate: Date; schedule: 'first_of_month' | 'monthly_on_day' } {
    const schedule = dto.schedule || (dto.dayOfMonth && dto.dayOfMonth !== 1 ? 'monthly_on_day' : 'first_of_month');
    const requested = toDateOnly(dto.firstDueDate);
    if (!requested) {
      throw new BadRequestException('First due date is required');
    }
    const dayOfMonth = schedule === 'first_of_month' ? 1 : (dto.dayOfMonth || requested.getDate());
    if (dayOfMonth < 1 || dayOfMonth > 28) {
      throw new BadRequestException('Installment day must be between 1 and 28');
    }
    const firstDueDate = nextOnOrAfter(requested, dayOfMonth);
    return { dayOfMonth, firstDueDate, schedule };
  }

  private applyDueFilters(queryBuilder: ReturnType<Repository<InstallmentDue>['createQueryBuilder']>, filterDto?: FilterDto) {
    const today = toIsoDate(todayDate());
    const soon = toIsoDate(addDays(todayDate(), 2));
    const weekStart = toIsoDate(startOfWeek());
    const weekEnd = toIsoDate(endOfWeek());
    const status = filterDto?.installmentStatus;

    if (status === 'pending') {
      queryBuilder.andWhere('due.paidAmount + 0.001 < due.amount');
      queryBuilder.andWhere('due.dueDate <= :today', { today });
    } else if (status === 'upcoming') {
      queryBuilder.andWhere('due.paidAmount + 0.001 < due.amount');
      queryBuilder.andWhere('due.dueDate > :today', { today });
    } else if (status === 'completed') {
      queryBuilder.andWhere('due.paidAmount + 0.001 >= due.amount');
    } else if (status === 'dueSoon') {
      queryBuilder.andWhere('due.paidAmount + 0.001 < due.amount');
      queryBuilder.andWhere('due.dueDate >= :today AND due.dueDate <= :soon', { today, soon });
    } else if (status === 'completedThisWeek') {
      queryBuilder.andWhere('due.paidAmount + 0.001 >= due.amount');
      queryBuilder.andWhere('due.paidOn >= :weekStart AND due.paidOn <= :weekEnd', { weekStart, weekEnd });
    }

    if (filterDto?.date) {
      queryBuilder.andWhere('due.dueDate = :date', { date: filterDto.date });
    } else {
      if (filterDto?.dateFrom) {
        queryBuilder.andWhere('due.dueDate >= :dateFrom', { dateFrom: filterDto.dateFrom });
      }
      if (filterDto?.dateTo) {
        queryBuilder.andWhere('due.dueDate <= :dateTo', { dateTo: filterDto.dateTo });
      }
    }
    if (filterDto?.customerId) {
      queryBuilder.andWhere('plan.customer_id = :customerId', { customerId: Number(filterDto.customerId) });
    }
    if (filterDto?.search?.trim()) {
      const term = `%${filterDto.search.trim()}%`;
      queryBuilder.andWhere('(plan.title ILIKE :term OR customer.name ILIKE :term OR customer.phone ILIKE :term)', { term });
    }
  }

  async createPlan(dto: CreateInstallmentPlanDto): Promise<InstallmentPlan> {
    const shopId = dto.shopId;
    if (!shopId) {
      throw new BadRequestException('Shop is required');
    }
    if (!dto.customerId && !dto.newCustomer?.name?.trim()) {
      throw new BadRequestException('Customer is required for an installment plan');
    }
    const total = money(dto.totalAmount);
    const down = money(dto.downPayment);
    if (down > total + 0.001) {
      throw new BadRequestException('Down payment cannot exceed the total amount');
    }
    const count = Number(dto.installmentCount);
    const financed = money(total - down);
    if (financed <= 0) {
      throw new BadRequestException('After the down payment there must be an amount left to schedule');
    }
    const { dayOfMonth, firstDueDate, schedule } = this.resolveSchedule(dto);
    const amounts = splitInstallmentAmounts(financed, count);
    const dates = generateMonthlyDueDates(count, dayOfMonth, firstDueDate);

    return this.dataSource.transaction(async (em) => {
      const planRepo = em.getRepository(InstallmentPlan);
      const dueRepo = em.getRepository(InstallmentDue);
      const shopRepo = em.getRepository(Shop);

      assertShopAccess(shopId);
      const shop = await shopRepo.findOne({ where: tenantWhere({ id: shopId }) });
      if (!shop) {
        throw new BadRequestException('Shop not found');
      }
      const customer = await this.customersService.resolveForShop(shopId, dto.customerId, dto.newCustomer, em);
      if (!customer) {
        throw new BadRequestException('Customer is required for an installment plan');
      }

      const plan = planRepo.create({
        title: dto.title.trim(),
        notes: dto.notes?.trim() || null,
        totalAmount: total,
        downPayment: down,
        installmentCount: count,
        installmentAmount: amounts[0],
        schedule,
        dayOfMonth,
        firstDueDate: toIsoDate(firstDueDate) as string,
        amountPaid: down,
        paymentStatus: derivePaymentStatus(total, down),
      });
      stampOwnership(plan);
      plan.shop = shop;
      plan.customer = customer;
      const saved = await planRepo.save(plan);

      for (let index = 0; index < count; index += 1) {
        const due = dueRepo.create({
          plan: saved,
          sequence: index + 1,
          dueDate: toIsoDate(dates[index]) as string,
          amount: amounts[index],
          paidAmount: 0,
          paidOn: null,
        });
        stampOwnership(due);
        due.shop = shop;
        await dueRepo.save(due);
      }

      return saved.id;
    }).then(async (id) => {
      const created = await this.findPlan(id);
      if (!created) {
        throw new BadRequestException('Installment plan could not be loaded after create');
      }
      return created;
    });
  }

  async findPlans(filterDto?: FilterDto, shopId?: number) {
    const queryBuilder = this.plansRepository.createQueryBuilder('plan')
      .leftJoinAndSelect('plan.customer', 'customer')
      .leftJoinAndSelect('plan.shop', 'shop')
      .where('plan.is_archived = :archived', { archived: false });
    applyTenantScope(queryBuilder, 'plan');
    applyShopScope(queryBuilder, 'plan', shopId);
    if (filterDto?.customerId) {
      queryBuilder.andWhere('plan.customer_id = :customerId', { customerId: Number(filterDto.customerId) });
    }
    if (filterDto?.search?.trim()) {
      const term = `%${filterDto.search.trim()}%`;
      queryBuilder.andWhere('(plan.title ILIKE :term OR customer.name ILIKE :term OR customer.phone ILIKE :term)', { term });
    }
    if (filterDto?.paymentStatus) {
      queryBuilder.andWhere('plan.paymentStatus = :paymentStatus', { paymentStatus: filterDto.paymentStatus });
    }
    queryBuilder.orderBy('plan.createdAt', 'DESC');

    const page = filterDto?.page ? Number(filterDto.page) : undefined;
    const limit = filterDto?.limit ? Number(filterDto.limit) : undefined;
    if (page && limit) {
      const total = await queryBuilder.getCount();
      queryBuilder.skip((page - 1) * limit).take(limit);
      const data = (await queryBuilder.getMany()).map(plan => this.presentPlan(plan));
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 0 };
    }
    return (await queryBuilder.getMany()).map(plan => this.presentPlan(plan));
  }

  async findPlan(id: number): Promise<InstallmentPlan | null> {
    const plan = await this.plansRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['customer', 'shop', 'dues'],
    });
    if (!plan || !canAccessShopRecord(plan.shop?.id)) {
      return null;
    }
    return this.presentPlan(plan);
  }

  async updatePlan(id: number, dto: UpdateInstallmentPlanDto): Promise<InstallmentPlan | null> {
    const plan = await this.plansRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['shop'],
    });
    if (!plan || !canAccessShopRecord(plan.shop?.id)) {
      return null;
    }
    if (dto.title !== undefined) {
      plan.title = dto.title.trim();
    }
    if (dto.notes !== undefined) {
      plan.notes = dto.notes?.trim() || null;
    }
    await this.plansRepository.save(plan);
    return this.findPlan(id);
  }

  async removePlan(id: number): Promise<boolean> {
    return this.dataSource.transaction(async (em) => {
      const planRepo = em.getRepository(InstallmentPlan);
      const dueRepo = em.getRepository(InstallmentDue);
      const plan = await planRepo.findOne({
        where: tenantWhere({ id, is_archived: false }),
        relations: ['shop'],
      });
      if (!plan || !canAccessShopRecord(plan.shop?.id)) {
        return false;
      }
      plan.is_archived = true;
      await planRepo.save(plan);
      const archiveDues = dueRepo.createQueryBuilder()
        .update(InstallmentDue)
        .set({ is_archived: true })
        .where('plan_id = :id', { id })
        .andWhere('shop_id = :shopId', { shopId: plan.shop.id });
      const tenantId = resolveTenantId();
      if (tenantId) {
        archiveDues.andWhere('tenant_id = :tenantId', { tenantId });
      }
      await archiveDues.execute();
      return true;
    });
  }

  async findDues(filterDto?: FilterDto, shopId?: number) {
    const queryBuilder = this.duesRepository.createQueryBuilder('due')
      .innerJoinAndSelect('due.plan', 'plan')
      .leftJoinAndSelect('plan.customer', 'customer')
      .leftJoinAndSelect('due.shop', 'shop')
      .where('due.is_archived = :archived', { archived: false })
      .andWhere('plan.is_archived = :planArchived', { planArchived: false });
    applyTenantScope(queryBuilder, 'due');
    applyShopScope(queryBuilder, 'due', shopId);
    this.applyDueFilters(queryBuilder, filterDto);
    queryBuilder.orderBy('due.dueDate', 'ASC').addOrderBy('due.sequence', 'ASC');

    const page = filterDto?.page ? Number(filterDto.page) : undefined;
    const limit = filterDto?.limit ? Number(filterDto.limit) : undefined;
    if (page && limit) {
      const total = await queryBuilder.getCount();
      queryBuilder.skip((page - 1) * limit).take(limit);
      const data = (await queryBuilder.getMany()).map(due => this.presentDue(due));
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 0 };
    }
    return (await queryBuilder.getMany()).map(due => this.presentDue(due));
  }

  async payDue(id: number, dto: PayInstallmentDueDto): Promise<InstallmentDue | null> {
    return this.dataSource.transaction(async (em) => {
      const dueRepo = em.getRepository(InstallmentDue);
      const planRepo = em.getRepository(InstallmentPlan);
      const due = await dueRepo.findOne({
        where: tenantWhere({ id, is_archived: false }),
        relations: ['shop', 'plan', 'plan.shop'],
      });
      if (!due || !canAccessShopRecord(due.shop?.id)) {
        return null;
      }
      if (!due.plan || due.plan.is_archived) {
        throw new BadRequestException('Installment plan was not found');
      }
      if (due.plan.shop?.id && Number(due.plan.shop.id) !== Number(due.shop?.id)) {
        throw new BadRequestException('Installment not found');
      }

      const remaining = remainingBalance(due.amount, due.paidAmount);
      if (remaining <= 0) {
        throw new BadRequestException('This installment is already completed');
      }
      const incoming = dto.amount == null ? remaining : money(dto.amount);
      if (incoming <= 0) {
        throw new BadRequestException('Payment amount must be greater than 0');
      }
      if (incoming > remaining + 0.001) {
        throw new BadRequestException(`Payment exceeds remaining installment of ${remaining.toFixed(2)}`);
      }

      due.paidAmount = money(money(due.paidAmount) + incoming);
      due.paidOn = dto.paidOn || (toIsoDate(todayDate()) as string);
      if (dto.notes?.trim()) {
        due.notes = dto.notes.trim();
      }
      await dueRepo.save(due);

      const plan = await planRepo.findOne({
        where: tenantWhere({ id: due.plan.id, is_archived: false }),
        relations: ['dues', 'shop'],
      });
      if (!plan || !canAccessShopRecord(plan.shop?.id)) {
        throw new BadRequestException('Installment plan was not found');
      }
      const duesPaid = (plan.dues || [])
        .filter(row => !row.is_archived)
        .reduce((sum, row) => sum + money(row.paidAmount), 0);
      plan.amountPaid = money(money(plan.downPayment) + duesPaid);
      plan.paymentStatus = derivePaymentStatus(plan.totalAmount, plan.amountPaid);
      await planRepo.save(plan);

      const saved = await dueRepo.findOne({
        where: tenantWhere({ id, is_archived: false }),
        relations: ['plan', 'plan.customer', 'shop'],
      });
      return this.presentDue(saved);
    });
  }

  async getTotals(filterDto?: FilterDto, shopId?: number) {
    const today = toIsoDate(todayDate());
    const soon = toIsoDate(addDays(todayDate(), 2));
    const weekStart = toIsoDate(startOfWeek());
    const weekEnd = toIsoDate(endOfWeek());

    const duesQuery = () => {
      const queryBuilder = this.duesRepository.createQueryBuilder('due')
        .innerJoin('due.plan', 'plan')
        .leftJoin('plan.customer', 'customer')
        .where('due.is_archived = :archived', { archived: false })
        .andWhere('plan.is_archived = :planArchived', { planArchived: false });
      applyTenantScope(queryBuilder, 'due');
      applyShopScope(queryBuilder, 'due', shopId);
      return queryBuilder;
    };

    const filteredQuery = duesQuery();
    this.applyDueFilters(filteredQuery, filterDto);

    const [filtered, report] = await Promise.all([
      filteredQuery
        .select('COALESCE(SUM(due.amount), 0)', 'scheduled')
        .addSelect('COALESCE(SUM(due.paidAmount), 0)', 'collected')
        .getRawOne(),
      duesQuery()
        .select('COALESCE(SUM(due.paidAmount), 0)', 'collected')
        .addSelect('COALESCE(SUM(CASE WHEN due.paidAmount + 0.001 < due.amount AND due.dueDate <= :today THEN due.amount - due.paidAmount ELSE 0 END), 0)', 'pending')
        .addSelect('COALESCE(SUM(CASE WHEN due.paidAmount + 0.001 < due.amount AND due.dueDate > :today THEN due.amount - due.paidAmount ELSE 0 END), 0)', 'upcoming')
        .addSelect('COALESCE(SUM(CASE WHEN due.paidAmount + 0.001 < due.amount AND due.dueDate >= :today AND due.dueDate <= :soon THEN due.amount - due.paidAmount ELSE 0 END), 0)', 'dueSoon')
        .addSelect('COALESCE(SUM(CASE WHEN due.paidAmount + 0.001 >= due.amount AND due.paidOn >= :weekStart AND due.paidOn <= :weekEnd THEN due.paidAmount ELSE 0 END), 0)', 'completedThisWeek')
        .setParameter('today', today)
        .setParameter('soon', soon)
        .setParameter('weekStart', weekStart)
        .setParameter('weekEnd', weekEnd)
        .getRawOne(),
    ]);

    const downQuery = this.plansRepository.createQueryBuilder('plan')
      .where('plan.is_archived = :archived', { archived: false });
    applyTenantScope(downQuery, 'plan');
    applyShopScope(downQuery, 'plan', shopId);
    const down = await downQuery.select('COALESCE(SUM(plan.downPayment), 0)', 'downPayments').getRawOne();

    const periodDues = duesQuery();
    const periodDown = this.plansRepository.createQueryBuilder('plan')
      .where('plan.is_archived = :archived', { archived: false });
    applyTenantScope(periodDown, 'plan');
    applyShopScope(periodDown, 'plan', shopId);
    if (filterDto?.date) {
      periodDues.andWhere('due.paidOn = :paidOn', { paidOn: filterDto.date });
      periodDown.andWhere('DATE(plan.createdAt) = DATE(:downDate)', { downDate: filterDto.date });
    } else {
      if (filterDto?.dateFrom) {
        periodDues.andWhere('due.paidOn >= :paidFrom', { paidFrom: filterDto.dateFrom });
        periodDown.andWhere('DATE(plan.createdAt) >= DATE(:downFrom)', { downFrom: filterDto.dateFrom });
      }
      if (filterDto?.dateTo) {
        periodDues.andWhere('due.paidOn <= :paidTo', { paidTo: filterDto.dateTo });
        periodDown.andWhere('DATE(plan.createdAt) <= DATE(:downTo)', { downTo: filterDto.dateTo });
      }
    }
    const [periodCollectedRow, periodDownRow] = await Promise.all([
      periodDues.select('COALESCE(SUM(due.paidAmount), 0)', 'collected').getRawOne(),
      periodDown.select('COALESCE(SUM(plan.downPayment), 0)', 'downPayments').getRawOne(),
    ]);

    const collectedDues = money(report?.collected);
    const downPayments = money(down?.downPayments);
    const periodCollected = money(periodCollectedRow?.collected);
    const periodDownPayments = money(periodDownRow?.downPayments);
    return {
      scheduled: money(filtered?.scheduled),
      collected: money(filtered?.collected),
      pending: money(report?.pending),
      upcoming: money(report?.upcoming),
      dueSoon: money(report?.dueSoon),
      completedThisWeek: money(report?.completedThisWeek),
      downPayments,
      profit: money(collectedDues + downPayments),
      periodProfit: money(periodCollected + periodDownPayments),
      outstanding: money(report?.pending),
    };
  }
}
