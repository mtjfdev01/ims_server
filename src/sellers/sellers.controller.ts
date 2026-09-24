import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { SellersService } from './sellers.service';
import { CreateSellerDto } from './dto/create-seller.dto';
import { UpdateSellerDto } from './dto/update-seller.dto';
import { FilterDto } from '../common/filter.dto';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { Permission } from '../rbac/permissions';

@Controller('sellers')
@RequirePermissions(Permission.SELLERS_READ)
export class SellersController {
  constructor(private readonly sellersService: SellersService) {}

  @Post()
  @RequirePermissions(Permission.SELLERS_WRITE)
  create(@Body() createSellerDto: CreateSellerDto) {
    return this.sellersService.create(createSellerDto);
  }

  @Get()
  findAll(@Query() filterDto: FilterDto, @Query('shopId') shopId?: string) {
    return this.sellersService.findAll(filterDto, shopId ? +shopId : undefined);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const seller = await this.sellersService.findOne(+id);
    if (!seller) {
      return { error: 'Seller not found' };
    }
    return seller;
  }

  @Patch(':id')
  @RequirePermissions(Permission.SELLERS_WRITE)
  async update(@Param('id') id: string, @Body() updateSellerDto: UpdateSellerDto) {
    const seller = await this.sellersService.update(+id, updateSellerDto);
    if (!seller) {
      return { error: 'Seller not found' };
    }
    return seller;
  }

  @Delete(':id')
  @RequirePermissions(Permission.SELLERS_DELETE)
  async remove(@Param('id') id: string) {
    const result = await this.sellersService.remove(+id);
    if (!result) {
      return { error: 'Seller not found' };
    }
    return { message: 'Seller deleted successfully' };
  }
}
