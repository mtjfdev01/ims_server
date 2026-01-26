import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { FilterDto } from '../common/filter.dto';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
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

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateSaleDto: UpdateSaleDto) {
    const sale = await this.salesService.update(+id, updateSaleDto);
    if (!sale) {
      return { error: 'Sale not found' };
    }
    return sale;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.salesService.remove(+id);
    if (!result) {
      return { error: 'Sale not found' };
    }
    return { message: 'Sale deleted successfully' };
  }
}
