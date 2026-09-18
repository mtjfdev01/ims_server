import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { FilterDto } from '../common/filter.dto';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { Permission } from '../rbac/permissions';

@Controller('orders')
@RequirePermissions(Permission.ORDERS_READ)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @RequirePermissions(Permission.ORDERS_WRITE)
  async create(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }

  @Get()
  async findAll(@Query() filterDto: FilterDto, @Query('shopId') shopId?: string) {
    return this.ordersService.findAll(filterDto, shopId ? +shopId : undefined);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const order = await this.ordersService.findOne(+id);
    if (!order) {
      return { error: 'Order not found' };
    }
    return order;
  }

  @Patch(':id')
  @RequirePermissions(Permission.ORDERS_WRITE)
  async update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
    const order = await this.ordersService.update(+id, updateOrderDto);
    if (!order) {
      return { error: 'Order not found' };
    }
    return order;
  }

  @Post(':id/return-items')
  @RequirePermissions(Permission.ORDERS_WRITE)
  async returnItems(
    @Param('id') orderId: string,
    @Body() body: { itemId: number; returnedQuantity: number }
  ) {
    const order = await this.ordersService.returnItems(+orderId, body.itemId, body.returnedQuantity);
    if (!order) {
      return { error: 'Order not found' };
    }
    return order;
  }

  @Delete(':id')
  @RequirePermissions(Permission.ORDERS_DELETE)
  async remove(@Param('id') id: string) {
    const result = await this.ordersService.remove(+id);
    if (!result) {
      return { error: 'Order not found' };
    }
    return { message: 'Order deleted successfully' };
  }
}
