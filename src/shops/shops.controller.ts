import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ShopsService } from './shops.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { PaginationDto } from '../common/pagination.dto';

@Controller('shops')
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Post()
  async create(@Body() createShopDto: CreateShopDto, @Query('userId') userId?: string) {
    return this.shopsService.create(createShopDto, userId ? +userId : undefined);
  }

  @Get()
  async findAll(@Query() paginationDto: PaginationDto, @Query('userId') userId?: string) {
    return this.shopsService.findAll(paginationDto, userId ? +userId : undefined);
  }

  @Get(':id/items')
  async getShopItems(@Param('id') id: string, @Query('userId') userId?: string) {
    return this.shopsService.getItems(+id, userId ? +userId : undefined);
  }

  @Get(':id/asset-value')
  async getAssetValue(@Param('id') id: string, @Query('userId') userId?: string) {
    const value = await this.shopsService.getAssetValue(+id, userId ? +userId : undefined);
    return { assetValue: value };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Query('userId') userId?: string) {
    const shop = await this.shopsService.findOne(+id, userId ? +userId : undefined);
    if (!shop) {
      return { error: 'Shop not found' };
    }
    return shop;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateShopDto: UpdateShopDto) {
    const shop = await this.shopsService.update(+id, updateShopDto);
    if (!shop) {
      return { error: 'Shop not found' };
    }
    return shop;
  }

  @Delete('all')
  async removeAll() {
    const result = await this.shopsService.removeAll();
    return { message: `Successfully deleted ${result} shop(s)` };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.shopsService.remove(+id);
    if (!result) {
      return { error: 'Shop not found' };
    }
    return { message: 'Shop deleted successfully' };
  }
}
