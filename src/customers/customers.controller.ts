import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { FilterDto } from '../common/filter.dto';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { Permission } from '../rbac/permissions';

@Controller('customers')
@RequirePermissions(Permission.CUSTOMERS_READ)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @RequirePermissions(Permission.CUSTOMERS_WRITE)
  create(@Body() createCustomerDto: CreateCustomerDto) {
    return this.customersService.create(createCustomerDto);
  }

  @Get()
  findAll(@Query() filterDto: FilterDto, @Query('shopId') shopId?: string) {
    return this.customersService.findAll(filterDto, shopId ? +shopId : undefined);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const customer = await this.customersService.findOne(+id);
    if (!customer) {
      return { error: 'Customer not found' };
    }
    return customer;
  }

  @Patch(':id')
  @RequirePermissions(Permission.CUSTOMERS_WRITE)
  async update(@Param('id') id: string, @Body() updateCustomerDto: UpdateCustomerDto) {
    const customer = await this.customersService.update(+id, updateCustomerDto);
    if (!customer) {
      return { error: 'Customer not found' };
    }
    return customer;
  }

  @Delete(':id')
  @RequirePermissions(Permission.CUSTOMERS_DELETE)
  async remove(@Param('id') id: string) {
    const result = await this.customersService.remove(+id);
    if (!result) {
      return { error: 'Customer not found' };
    }
    return { message: 'Customer deleted successfully' };
  }
}
