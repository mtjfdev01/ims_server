import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';
import { Purchase } from './entities/purchase.entity';
import { Item } from '../items/entities/item.entity';
import { Shop } from '../shops/entities/shop.entity';
import { StockLotsModule } from '../stock-lots/stock-lots.module';
import { SellersModule } from '../sellers/sellers.module';

@Module({
  imports: [TypeOrmModule.forFeature([Purchase, Item, Shop]), StockLotsModule, SellersModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
