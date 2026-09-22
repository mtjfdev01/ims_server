import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { CreateSalePaymentDto } from '../sale-payments/dto/create-sale-payment.dto';
import { FilterDto } from '../common/filter.dto';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { Permission } from '../rbac/permissions';

@Controller('sales')
@RequirePermissions(Permission.SALES_READ)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @RequirePermissions(Permission.SALES_WRITE)
  async create(@Body() createSaleDto: CreateSaleDto) {
    return this.salesService.create(createSaleDto);
  }

  @Get()
  async findAll(@Query() filterDto: FilterDto, @Query('shopId') shopId?: string) {
    return this.salesService.findAll(filterDto, shopId ? +shopId : undefined);
  }

  @Get('totals')
  async getTotals(@Query() filterDto: FilterDto, @Query('shopId') shopId?: string) {
    return this.salesService.getTotals(filterDto, shopId ? +shopId : undefined);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const sale = await this.salesService.findOne(+id);
    if (!sale) {
      return { error: 'Sale not found' };
    }
    return sale;
  }

  @Post(':id/payments')
  @RequirePermissions(Permission.SALES_WRITE)
  async addPayment(@Param('id') id: string, @Body() dto: CreateSalePaymentDto) {
    const sale = await this.salesService.addPayment(+id, dto);
    if (!sale) {
      return { error: 'Sale not found' };
    }
    return sale;
  }

  @Patch(':id')
  @RequirePermissions(Permission.SALES_WRITE)
  async update(@Param('id') id: string, @Body() updateSaleDto: UpdateSaleDto) {
    const sale = await this.salesService.update(+id, updateSaleDto);
    if (!sale) {
      return { error: 'Sale not found' };
    }
    return sale;
  }

  @Delete(':id')
  @RequirePermissions(Permission.SALES_DELETE)
  async remove(@Param('id') id: string) {
    const result = await this.salesService.remove(+id);
    if (!result) {
      return { error: 'Sale not found' };
    }
    return { message: 'Sale deleted successfully' };
  }
}
