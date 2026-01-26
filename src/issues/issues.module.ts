import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IssuesService } from './issues.service';
import { IssuesController } from './issues.controller';
import { Issue } from './entities/issue.entity';
import { Item } from '../items/entities/item.entity';
import { Store } from '../stores/entities/store.entity';
import { Shop } from '../shops/entities/shop.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Issue, Item, Store, Shop])],
  controllers: [IssuesController],
  providers: [IssuesService],
})
export class IssuesModule {}
