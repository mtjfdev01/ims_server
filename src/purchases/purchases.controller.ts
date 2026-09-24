import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { FilterDto } from '../common/filter.dto';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { Permission } from '../rbac/permissions';

@Controller('purchases')
@RequirePermissions(Permission.PURCHASES_READ)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post()
  @RequirePermissions(Permission.PURCHASES_WRITE)
  async create(@Body() createPurchaseDto: CreatePurchaseDto) {
    return this.purchasesService.create(createPurchaseDto);
  }

  @Get()
  async findAll(@Query() filterDto: FilterDto & { itemId?: string; shopId?: string; sellerId?: string }) {
    const filters: any = { ...filterDto };
    if (filterDto.itemId) {
      filters.itemId = parseInt(filterDto.itemId);
    }
    if (filterDto.shopId) {
      filters.shopId = parseInt(filterDto.shopId);
    }
    if (filterDto.sellerId) {
      filters.sellerId = parseInt(filterDto.sellerId);
    }
    return this.purchasesService.findAll(filters);
  }

  @Get('totals')
  async getTotal(@Query() filterDto: FilterDto & { itemId?: string; shopId?: string; sellerId?: string }) {
    const filters: any = { ...filterDto };
    if (filterDto.itemId) {
      filters.itemId = parseInt(filterDto.itemId);
    }
    if (filterDto.shopId) {
      filters.shopId = parseInt(filterDto.shopId);
    }
    if (filterDto.sellerId) {
      filters.sellerId = parseInt(filterDto.sellerId);
    }
    const total = await this.purchasesService.getTotal(filters);
    return { total };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const purchase = await this.purchasesService.findOne(+id);
    if (!purchase) {
      return { error: 'Purchase not found' };
    }
    return purchase;
  }

  @Patch(':id')
  @RequirePermissions(Permission.PURCHASES_WRITE)
  async update(@Param('id') id: string, @Body() updatePurchaseDto: UpdatePurchaseDto) {
    const purchase = await this.purchasesService.update(+id, updatePurchaseDto);
    if (!purchase) {
      return { error: 'Purchase not found' };
    }
    return purchase;
  }

  @Delete(':id')
  @RequirePermissions(Permission.PURCHASES_DELETE)
  async remove(@Param('id') id: string) {
    const result = await this.purchasesService.remove(+id);
    if (!result) {
      return { error: 'Purchase not found' };
    }
    return { message: 'Purchase deleted successfully' };
  }
}
