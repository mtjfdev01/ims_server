import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { Store } from './entities/store.entity';
import { Item } from '../items/entities/item.entity';
import { Shop } from '../shops/entities/shop.entity';
import { StockLotsModule } from '../stock-lots/stock-lots.module';

@Module({
  imports: [TypeOrmModule.forFeature([Store, Item, Shop]), StockLotsModule],
  controllers: [StoresController],
  providers: [StoresService],
})
export class StoresModule {}
