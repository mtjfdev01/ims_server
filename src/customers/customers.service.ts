import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Shop } from '../shops/entities/shop.entity';
import { FilterDto } from '../common/filter.dto';
import { paginateQuery } from '../common/pagination.util';
import { applyShopOrUnscoped, applyTenantScope, assertShopAccess, canAccessOptionalShopRecord, canAccessShopRecord, skipsShopFilter, stampOwnership, tenantWhere } from '../common/access.util';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private customersRepository: Repository<Customer>,
    @InjectRepository(Shop)
    private shopRepository: Repository<Shop>,
  ) {}

  async create(dto: CreateCustomerDto): Promise<Customer> {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Customer name is required');
    }
    const customer = this.customersRepository.create({
      name: dto.name.trim(),
      phone: dto.phone?.trim() || null,
      email: dto.email?.trim() || null,
      address: dto.address?.trim() || null,
      notes: dto.notes?.trim() || null,
    });
    stampOwnership(customer);

    const shopId = dto.shopId;
    if (!skipsShopFilter() && !shopId) {
      throw new BadRequestException('Shop is required');
    }
    if (shopId) {
      assertShopAccess(shopId);
      const shop = await this.shopRepository.findOne({ where: tenantWhere({ id: shopId }) });
      if (!shop) {
        throw new BadRequestException('Shop not found');
      }
      customer.shop = shop;
    }

    return this.customersRepository.save(customer);
  }

  async resolveForShop(
    shopId: number,
    customerId?: number,
    newCustomer?: { name: string; phone?: string; email?: string; address?: string },
    em?: EntityManager,
  ): Promise<Customer | null> {
    const customerRepo = em ? em.getRepository(Customer) : this.customersRepository;
    const shopRepo = em ? em.getRepository(Shop) : this.shopRepository;
    if (newCustomer?.name?.trim()) {
      const created = customerRepo.create({
        name: newCustomer.name.trim(),
        phone: newCustomer.phone?.trim() || null,
        email: newCustomer.email?.trim() || null,
        address: newCustomer.address?.trim() || null,
      });
      stampOwnership(created);
      const shop = await shopRepo.findOne({ where: tenantWhere({ id: shopId }) });
      if (!shop) {
        throw new BadRequestException('Shop not found');
      }
      created.shop = shop;
      return customerRepo.save(created);
    }
    if (!customerId) {
      return null;
    }
    const customer = await customerRepo.findOne({
      where: tenantWhere({ id: customerId, is_archived: false }),
      relations: ['shop'],
    });
    if (!customer) {
      throw new BadRequestException('Customer not found');
    }
    if (customer.shop?.id && Number(customer.shop.id) !== Number(shopId)) {
      throw new BadRequestException('Customer does not belong to this shop');
    }
    if (customer.shop?.id && !canAccessOptionalShopRecord(customer.shop.id)) {
      throw new BadRequestException('Customer not found');
    }
    return customer;
  }

  async findAll(filterDto?: FilterDto | string, shopId?: number) {
    const search = typeof filterDto === 'string' ? filterDto : filterDto?.search;
    const queryBuilder = this.customersRepository.createQueryBuilder('customer')
      .leftJoinAndSelect('customer.shop', 'shop')
      .where('customer.is_archived = :archived', { archived: false });
    applyTenantScope(queryBuilder, 'customer');
    if (shopId) {
      assertShopAccess(shopId);
      queryBuilder.andWhere('(customer.shop_id = :shopId OR customer.shop_id IS NULL)', { shopId });
    } else {
      applyShopOrUnscoped(queryBuilder, 'customer');
    }
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      queryBuilder.andWhere(
        '(customer.name ILIKE :term OR customer.phone ILIKE :term OR customer.email ILIKE :term OR customer.address ILIKE :term)',
        { term },
      );
    }
    if (typeof filterDto === 'object' && filterDto?.date) {
      queryBuilder.andWhere('DATE(customer.createdAt) = DATE(:date)', { date: filterDto.date });
    } else if (typeof filterDto === 'object') {
      if (filterDto?.dateFrom) {
        queryBuilder.andWhere('DATE(customer.createdAt) >= DATE(:dateFrom)', { dateFrom: filterDto.dateFrom });
      }
      if (filterDto?.dateTo) {
        queryBuilder.andWhere('DATE(customer.createdAt) <= DATE(:dateTo)', { dateTo: filterDto.dateTo });
      }
    }
    queryBuilder.orderBy('customer.name', 'ASC');
    return paginateQuery(queryBuilder, typeof filterDto === 'object' ? filterDto : undefined);
  }

  async findOne(id: number): Promise<Customer | null> {
    const customer = await this.customersRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['shop', 'sales', 'sales.shop', 'sales.saleItems', 'sales.saleItems.item', 'serviceJobs', 'serviceJobs.shop', 'installmentPlans', 'installmentPlans.shop'],
    });
    if (!customer) {
      return null;
    }
    if (customer.shop?.id) {
      if (!canAccessOptionalShopRecord(customer.shop.id)) {
        return null;
      }
    } else if (!skipsShopFilter()) {
      // org-wide customer is visible to assigned shop staff
    }
    if (customer.sales) {
      customer.sales = customer.sales
        .filter(sale => !sale.is_archived && canAccessShopRecord(sale.shop?.id))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    if (customer.serviceJobs) {
      customer.serviceJobs = customer.serviceJobs
        .filter(job => !job.is_archived && canAccessShopRecord(job.shop?.id))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    if (customer.installmentPlans) {
      customer.installmentPlans = customer.installmentPlans
        .filter(plan => !plan.is_archived && canAccessShopRecord(plan.shop?.id))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return customer;
  }

  private async loadForWrite(id: number): Promise<Customer | null> {
    const customer = await this.customersRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['shop'],
    });
    if (!customer) {
      return null;
    }
    if (customer.shop?.id && !canAccessOptionalShopRecord(customer.shop.id)) {
      return null;
    }
    return customer;
  }

  async update(id: number, dto: UpdateCustomerDto): Promise<Customer | null> {
    const customer = await this.loadForWrite(id);
    if (!customer) {
      return null;
    }
    if (dto.name !== undefined) {
      if (!dto.name.trim()) {
        throw new BadRequestException('Customer name is required');
      }
      customer.name = dto.name.trim();
    }
    if (dto.phone !== undefined) {
      customer.phone = dto.phone?.trim() || null;
    }
    if (dto.email !== undefined) {
      customer.email = dto.email?.trim() || null;
    }
    if (dto.address !== undefined) {
      customer.address = dto.address?.trim() || null;
    }
    if (dto.notes !== undefined) {
      customer.notes = dto.notes?.trim() || null;
    }
    if (dto.shopId !== undefined) {
      if (dto.shopId) {
        assertShopAccess(dto.shopId);
        const shop = await this.shopRepository.findOne({ where: tenantWhere({ id: dto.shopId }) });
        if (!shop) {
          throw new BadRequestException('Shop not found');
        }
        customer.shop = shop;
      } else if (skipsShopFilter()) {
        customer.shop = null;
      } else {
        throw new BadRequestException('Shop is required');
      }
    }
    await this.customersRepository.save(customer);
    return this.findOne(id);
  }

  async remove(id: number): Promise<boolean> {
    const customer = await this.loadForWrite(id);
    if (!customer) {
      return false;
    }
    customer.is_archived = true;
    await this.customersRepository.save(customer);
    return true;
  }
}
