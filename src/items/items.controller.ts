import { Controller, Get, Post, Body, Patch, Param, Delete, Query, NotFoundException } from '@nestjs/common';
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  async create(@Body() createItemDto: CreateItemDto) {
    return this.itemsService.create(createItemDto);
  }

  @Post('transfer')
  async transfer(@Body() transferDto: any) {
    const result = await this.itemsService.transfer(transferDto);
    return {
      message: `Successfully transferred ${transferDto.quantity} unit(s)`,
      sourceItem: result.sourceItem,
      destinationItem: result.destinationItem
    };
  }

  @Get()
  async findAll(
    @Query('storeId') storeId?: string, 
    @Query('shopId') shopId?: string,
    @Query('filterType') filterType?: 'store' | 'shop',
    @Query('search') search?: string
  ) {
    if (storeId) {
      return this.itemsService.findByStore(+storeId);
    }
    if (shopId) {
      return this.itemsService.findByShop(+shopId);
    }
    return this.itemsService.findAll(filterType, search);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const item = await this.itemsService.findOne(+id);
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    return item;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateItemDto: UpdateItemDto) {
    const item = await this.itemsService.update(+id, updateItemDto);
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    return item;
  }

  @Delete('all')
  async removeAll() {
    const result = await this.itemsService.removeAll();
    return { message: `Successfully deleted ${result} item(s)` };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.itemsService.remove(+id);
    if (!result) {
      throw new NotFoundException('Item not found');
    }
    return { message: 'Item deleted successfully' };
  }
}
