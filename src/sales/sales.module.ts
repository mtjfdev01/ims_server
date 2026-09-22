import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { Sale } from './entities/sale.entity';
import { SaleItem } from '../sale-items/entities/sale-item.entity';
import { Item } from '../items/entities/item.entity';
import { Shop } from '../shops/entities/shop.entity';
import { SalePayment } from '../sale-payments/entities/sale-payment.entity';
import { StockLotsModule } from '../stock-lots/stock-lots.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [TypeOrmModule.forFeature([Sale, SaleItem, Item, Shop, SalePayment]), StockLotsModule, CustomersModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
