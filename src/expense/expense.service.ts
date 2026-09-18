import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { Expense } from './entities/expense.entity';
import { Shop } from '../shops/entities/shop.entity';
import { applyShopScope, applyTenantScope, assertShopAccess, canAccessShopRecord, stampOwnership, tenantWhere } from '../common/access.util';

@Injectable()
export class ExpenseService {
  constructor(
    @InjectRepository(Expense)
    private expenseRepository: Repository<Expense>,
    @InjectRepository(Shop)
    private shopRepository: Repository<Shop>,
  ) {}

  async create(createExpenseDto: CreateExpenseDto): Promise<Expense> {
    if (!createExpenseDto.shopId) {
      throw new BadRequestException('Shop is required');
    }

    const expense = this.expenseRepository.create({
      description: createExpenseDto.description,
      price: createExpenseDto.price,
    });
    stampOwnership(expense);

    if (createExpenseDto.shopId) {
      assertShopAccess(createExpenseDto.shopId);
      const shop = await this.shopRepository.findOne({
        where: tenantWhere({ id: createExpenseDto.shopId }),
      });
      if (shop) {
        expense.shop = shop;
      }
    }

    return this.expenseRepository.save(expense);
  }

  findAll(filterDto?: { date?: string; dateFrom?: string; dateTo?: string }, shopId?: number): Promise<Expense[]> {
    const queryBuilder = this.expenseRepository.createQueryBuilder('expense')
      .leftJoinAndSelect('expense.shop', 'shop')
      .where('expense.is_archived = :archived', { archived: false });
    applyTenantScope(queryBuilder, 'expense');
    applyShopScope(queryBuilder, 'expense', shopId);

    if (filterDto?.date) {
      const date = new Date(filterDto.date);
      queryBuilder.andWhere('DATE(expense.createdAt) = DATE(:date)', { date });
    } else {
      if (filterDto?.dateFrom) {
        queryBuilder.andWhere('DATE(expense.createdAt) >= DATE(:dateFrom)', { dateFrom: filterDto.dateFrom });
      }
      if (filterDto?.dateTo) {
        queryBuilder.andWhere('DATE(expense.createdAt) <= DATE(:dateTo)', { dateTo: filterDto.dateTo });
      }
    }

    return queryBuilder.orderBy('expense.createdAt', 'DESC').getMany();
  }

  findByShop(shopId: number, filterDto?: { date?: string; dateFrom?: string; dateTo?: string }): Promise<Expense[]> {
    return this.findAll(filterDto, shopId);
  }

  async findOne(id: number): Promise<Expense | null> {
    const expense = await this.expenseRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['shop'],
    });
    if (!expense || !canAccessShopRecord(expense.shop?.id)) {
      return null;
    }
    return expense;
  }

  async update(id: number, updateExpenseDto: UpdateExpenseDto): Promise<Expense | null> {
    const expense = await this.expenseRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['shop'],
    });

    if (!expense || !canAccessShopRecord(expense.shop?.id)) {
      return null;
    }

    if (updateExpenseDto.description !== undefined) {
      expense.description = updateExpenseDto.description;
    }
    if (updateExpenseDto.price !== undefined) {
      expense.price = updateExpenseDto.price;
    }

    if (updateExpenseDto.shopId !== undefined) {
      if (updateExpenseDto.shopId) {
        assertShopAccess(updateExpenseDto.shopId);
        const shop = await this.shopRepository.findOne({
          where: tenantWhere({ id: updateExpenseDto.shopId }),
        });
        expense.shop = shop ?? null;
      } else {
        expense.shop = null;
      }
    }

    return this.expenseRepository.save(expense);
  }

  async remove(id: number): Promise<boolean> {
    const expense = await this.expenseRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['shop'],
    });

    if (!expense || !canAccessShopRecord(expense.shop?.id)) {
      return false;
    }

    // Soft delete: mark as archived instead of deleting
    expense.is_archived = true;
    await this.expenseRepository.save(expense);
    return true;
  }

  async getTotal(filterDto?: { date?: string; dateFrom?: string; dateTo?: string }, shopId?: number): Promise<number> {
    const queryBuilder = this.expenseRepository.createQueryBuilder('expense')
      .where('expense.is_archived = :archived', { archived: false });
    applyTenantScope(queryBuilder, 'expense');
    applyShopScope(queryBuilder, 'expense', shopId);

    if (filterDto?.date) {
      const date = new Date(filterDto.date);
      queryBuilder.andWhere('DATE(expense.createdAt) = DATE(:date)', { date });
    } else {
      if (filterDto?.dateFrom) {
        queryBuilder.andWhere('DATE(expense.createdAt) >= DATE(:dateFrom)', { dateFrom: filterDto.dateFrom });
      }
      if (filterDto?.dateTo) {
        queryBuilder.andWhere('DATE(expense.createdAt) <= DATE(:dateTo)', { dateTo: filterDto.dateTo });
      }
    }

    const result = await queryBuilder
      .select('SUM(expense.price)', 'total')
      .getRawOne();

    return parseFloat(result?.total || '0') || 0;
  }
}
