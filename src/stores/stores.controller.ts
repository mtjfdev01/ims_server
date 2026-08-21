import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Post()
  async create(@Body() createStoreDto: CreateStoreDto) {
    return this.storesService.create(createStoreDto);
  }

  @Get()
  async findAll() {
    return this.storesService.findAll();
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
  async update(@Param('id') id: string, @Body() updateStoreDto: UpdateStoreDto) {
    const store = await this.storesService.update(+id, updateStoreDto);
    if (!store) {
      return { error: 'Store not found' };
    }
    return store;
  }

  @Delete('all')
  async removeAll() {
    const result = await this.storesService.removeAll();
    return { message: `Successfully deleted ${result} store(s)` };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.storesService.remove(+id);
    if (!result) {
      return { error: 'Store not found' };
    }
    return { message: 'Store deleted successfully' };
  }
}
