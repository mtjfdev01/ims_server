import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { Expense } from './entities/expense.entity';
import { Shop } from '../shops/entities/shop.entity';

@Injectable()
export class ExpenseService {
  constructor(
    @InjectRepository(Expense)
    private expenseRepository: Repository<Expense>,
    @InjectRepository(Shop)
    private shopRepository: Repository<Shop>,
  ) {}

  async create(createExpenseDto: CreateExpenseDto): Promise<Expense> {
    const expense = this.expenseRepository.create({
      description: createExpenseDto.description,
      price: createExpenseDto.price,
    });

    if (createExpenseDto.shopId) {
      const shop = await this.shopRepository.findOne({
        where: { id: createExpenseDto.shopId },
      });
      if (shop) {
        expense.shop = shop;
      }
    }

    return this.expenseRepository.save(expense);
  }

  findAll(): Promise<Expense[]> {
    return this.expenseRepository.find({
      where: { is_archived: false },
      relations: ['shop'],
    });
  }

  findByShop(shopId: number): Promise<Expense[]> {
    return this.expenseRepository.find({
      where: { shop: { id: shopId }, is_archived: false },
      relations: ['shop'],
    });
  }

  findOne(id: number): Promise<Expense | null> {
    return this.expenseRepository.findOne({ where: { id, is_archived: false } });
  }

  async update(id: number, updateExpenseDto: UpdateExpenseDto): Promise<Expense | null> {
    const expense = await this.expenseRepository.findOne({
      where: { id, is_archived: false },
      relations: ['shop'],
    });

    if (!expense) {
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
        const shop = await this.shopRepository.findOne({
          where: { id: updateExpenseDto.shopId },
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
      where: { id, is_archived: false },
    });

    if (!expense) {
      return false;
    }

    // Soft delete: mark as archived instead of deleting
    expense.is_archived = true;
    await this.expenseRepository.save(expense);
    return true;
  }

  async getTotal(shopId?: number): Promise<number> {
    let queryBuilder = this.expenseRepository.createQueryBuilder('expense')
      .where('expense.is_archived = :archived', { archived: false });

    // Filter by shop if provided
    if (shopId) {
      queryBuilder.andWhere('expense.shop_id = :shopId', { shopId });
    }

    const result = await queryBuilder
      .select('SUM(expense.price)', 'total')
      .getRawOne();

    return parseFloat(result?.total || '0') || 0;
  }
}
