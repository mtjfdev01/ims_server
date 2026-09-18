import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { PaginationDto } from '../common/pagination.dto';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { Roles } from '../rbac/decorators/roles.decorator';
import { Permission } from '../rbac/permissions';
import { UserRole } from '../common/request-context';

@Controller('stores')
@RequirePermissions(Permission.STORES_READ)
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Post()
  @RequirePermissions(Permission.STORES_WRITE)
  async create(@Body() createStoreDto: CreateStoreDto) {
    return this.storesService.create(createStoreDto);
  }

  @Get()
  async findAll(@Query() paginationDto: PaginationDto) {
    return this.storesService.findAll(paginationDto);
  }

  @Get(':id/items')
  async getStoreItems(@Param('id') id: string) {
    return this.storesService.getItems(+id);
  }

  @Get(':id/asset-value')
  async getAssetValue(@Param('id') id: string) {
    const value = await this.storesService.getAssetValue(+id);
    return { assetValue: value };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const store = await this.storesService.findOne(+id);
    if (!store) {
      return { error: 'Store not found' };
    }
    return store;
  }

  @Patch(':id')
  @RequirePermissions(Permission.STORES_WRITE)
  async update(@Param('id') id: string, @Body() updateStoreDto: UpdateStoreDto) {
    const store = await this.storesService.update(+id, updateStoreDto);
    if (!store) {
      return { error: 'Store not found' };
    }
    return store;
  }

  @Delete('all')
  @RequirePermissions(Permission.BULK_DELETE)
  async removeAll() {
    const result = await this.storesService.removeAll();
    return { message: `Successfully deleted ${result} store(s)` };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @RequirePermissions(Permission.STORES_DELETE)
  async remove(@Param('id') id: string) {
    const result = await this.storesService.remove(+id);
    if (!result) {
      return { error: 'Store not found' };
    }
    return { message: 'Store deleted successfully' };
  }
}
