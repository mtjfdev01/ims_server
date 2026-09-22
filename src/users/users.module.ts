import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Shop } from '../shops/entities/shop.entity';
import { UserPermissionsModule } from '../user-permissions/user-permissions.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Tenant, Shop]), UserPermissionsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
