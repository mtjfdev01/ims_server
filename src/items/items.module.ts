import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';
import { Item } from './entities/item.entity';
import { Company } from '../companies/entities/company.entity';
import { Category } from '../category/entities/category.entity';
import { Store } from '../stores/entities/store.entity';
import { Shop } from '../shops/entities/shop.entity';
import { PurchasesModule } from '../purchases/purchases.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Item, Company, Category, Store, Shop]),
    forwardRef(() => PurchasesModule),
  ],
  controllers: [ItemsController],
  providers: [ItemsService],
})
export class ItemsModule {}
