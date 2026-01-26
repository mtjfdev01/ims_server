import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

@Controller('expense')
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Post()
  async create(@Body() createExpenseDto: CreateExpenseDto) {
    return this.expenseService.create(createExpenseDto);
  }

  @Get()
  async findAll(@Query('shopId') shopId?: string) {
    if (shopId) {
      return this.expenseService.findByShop(+shopId);
    }
    return this.expenseService.findAll();
  }

  @Get('totals')
  async getTotal(@Query('shopId') shopId?: string) {
    const total = await this.expenseService.getTotal(shopId ? +shopId : undefined);
    return { total };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const expense = await this.expenseService.findOne(+id);
    if (!expense) {
      return { error: 'Expense not found' };
    }
    return expense;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateExpenseDto: UpdateExpenseDto) {
    const expense = await this.expenseService.update(+id, updateExpenseDto);
    if (!expense) {
      return { error: 'Expense not found' };
    }
    return expense;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.expenseService.remove(+id);
    if (!result) {
      return { error: 'Expense not found' };
    }
    return { message: 'Expense deleted successfully' };
  }
}
