import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ShopsService } from './shops.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { FilterDto } from '../common/filter.dto';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { Roles } from '../rbac/decorators/roles.decorator';
import { Permission } from '../rbac/permissions';
import { UserRole } from '../common/request-context';

@Controller('shops')
@RequirePermissions(Permission.SHOPS_READ)
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Post()
  @RequirePermissions(Permission.SHOPS_WRITE)
  async create(@Body() createShopDto: CreateShopDto) {
    return this.shopsService.create(createShopDto);
  }

  @Get()
  async findAll(@Query() filterDto: FilterDto) {
    return this.shopsService.findAll(filterDto);
  }

  @Get(':id/items')
  async getShopItems(@Param('id') id: string) {
    return this.shopsService.getItems(+id);
  }

  @Get(':id/asset-value')
  async getAssetValue(@Param('id') id: string) {
    const value = await this.shopsService.getAssetValue(+id);
    return { assetValue: value };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const shop = await this.shopsService.findOne(+id);
    if (!shop) {
      return { error: 'Shop not found' };
    }
    return shop;
  }

  @Patch(':id')
  @RequirePermissions(Permission.SHOPS_WRITE)
  async update(@Param('id') id: string, @Body() updateShopDto: UpdateShopDto) {
    const shop = await this.shopsService.update(+id, updateShopDto);
    if (!shop) {
      return { error: 'Shop not found' };
    }
    return shop;
  }

  @Delete('all')
  @RequirePermissions(Permission.BULK_DELETE)
  async removeAll() {
    const result = await this.shopsService.removeAll();
    return { message: `Successfully deleted ${result} shop(s)` };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @RequirePermissions(Permission.SHOPS_DELETE)
  async remove(@Param('id') id: string) {
    const result = await this.shopsService.remove(+id);
    if (!result) {
      return { error: 'Shop not found' };
    }
    return { message: 'Shop deleted successfully' };
  }
}
