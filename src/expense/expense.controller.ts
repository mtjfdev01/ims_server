import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { FilterDto } from '../common/filter.dto';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { Permission } from '../rbac/permissions';

@Controller('expense')
@RequirePermissions(Permission.EXPENSES_READ)
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Post()
  @RequirePermissions(Permission.EXPENSES_WRITE)
  async create(@Body() createExpenseDto: CreateExpenseDto) {
    return this.expenseService.create(createExpenseDto);
  }

  @Get()
  async findAll(@Query() filterDto: FilterDto, @Query('shopId') shopId?: string) {
    return this.expenseService.findAll(filterDto, shopId ? +shopId : undefined);
  }

  @Get('totals')
  async getTotal(@Query() filterDto: FilterDto, @Query('shopId') shopId?: string) {
    const total = await this.expenseService.getTotal(filterDto, shopId ? +shopId : undefined);
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
  @RequirePermissions(Permission.EXPENSES_WRITE)
  async update(@Param('id') id: string, @Body() updateExpenseDto: UpdateExpenseDto) {
    const expense = await this.expenseService.update(+id, updateExpenseDto);
    if (!expense) {
      return { error: 'Expense not found' };
    }
    return expense;
  }

  @Delete(':id')
  @RequirePermissions(Permission.EXPENSES_DELETE)
  async remove(@Param('id') id: string) {
    const result = await this.expenseService.remove(+id);
    if (!result) {
      return { error: 'Expense not found' };
    }
    return { message: 'Expense deleted successfully' };
  }
}
