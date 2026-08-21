import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order } from './entities/order.entity';
import { OrderItem } from '../order-items/entities/order-item.entity';
import { Item } from '../items/entities/item.entity';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sale-items/entities/sale-item.entity';
import { Shop } from '../shops/entities/shop.entity';
import { StockLotsModule } from '../stock-lots/stock-lots.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Item, Sale, SaleItem, Shop]),
    StockLotsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
