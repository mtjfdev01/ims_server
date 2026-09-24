import { Controller, Get, Post, Body, Patch, Param, Delete, Query, NotFoundException } from '@nestjs/common';
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { Permission } from '../rbac/permissions';

@Controller('items')
@RequirePermissions(Permission.ITEMS_READ)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @RequirePermissions(Permission.ITEMS_WRITE)
  async create(@Body() createItemDto: CreateItemDto) {
    return this.itemsService.create(createItemDto);
  }

  @Post('transfer')
  @RequirePermissions(Permission.ITEMS_TRANSFER)
  async transfer(@Body() transferDto: any) {
    const result = await this.itemsService.transfer(transferDto);
    return {
      message: `Successfully transferred ${transferDto.quantity} unit(s)`,
      sourceItem: result.sourceItem,
      destinationItem: result.destinationItem,
    };
  }

  @Get()
  async findAll(
    @Query('storeId') storeId?: string,
    @Query('shopId') shopId?: string,
    @Query('filterType') filterType?: 'store' | 'shop' | Array<'store' | 'shop'>,
    @Query('search') search?: string,
    @Query('date') date?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('condition') condition?: string,
    @Query('companyId') companyId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    const type = Array.isArray(filterType) ? filterType[0] : filterType;
    return this.itemsService.findAll(
      type,
      search,
      shopId ? +shopId : undefined,
      storeId ? +storeId : undefined,
      { date, dateFrom, dateTo },
      page ? +page : undefined,
      limit ? +limit : undefined,
      condition,
      companyId ? +companyId : undefined,
      categoryId ? +categoryId : undefined,
    );
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
  @RequirePermissions(Permission.ITEMS_WRITE)
  async update(@Param('id') id: string, @Body() updateItemDto: UpdateItemDto) {
    const item = await this.itemsService.update(+id, updateItemDto);
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    return item;
  }

  @Delete('all')
  @RequirePermissions(Permission.BULK_DELETE)
  async removeAll() {
    const result = await this.itemsService.removeAll();
    return { message: `Successfully deleted ${result} item(s)` };
  }

  @Delete(':id')
  @RequirePermissions(Permission.ITEMS_DELETE)
  async remove(@Param('id') id: string) {
    const result = await this.itemsService.remove(+id);
    if (!result) {
      throw new NotFoundException('Item not found');
    }
    return { message: 'Item deleted successfully' };
  }
}
