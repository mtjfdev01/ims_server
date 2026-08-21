import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLot } from './entities/stock-lot.entity';
import { StockAllocation } from './entities/stock-allocation.entity';
import { Item } from '../items/entities/item.entity';
import { FifoService } from './fifo.service';

@Module({
  imports: [TypeOrmModule.forFeature([StockLot, StockAllocation, Item])],
  providers: [FifoService],
  exports: [FifoService],
})
export class StockLotsModule {}
