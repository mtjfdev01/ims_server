import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShopsService } from './shops.service';
import { ShopsController } from './shops.controller';
import { Shop } from './entities/shop.entity';
import { Item } from '../items/entities/item.entity';
import { Store } from '../stores/entities/store.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Shop, Item, Store, User])],
  controllers: [ShopsController],
  providers: [ShopsService],
})
export class ShopsModule {}
