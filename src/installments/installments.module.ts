import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstallmentsService } from './installments.service';
import { InstallmentsController } from './installments.controller';
import { InstallmentPlan } from './entities/installment-plan.entity';
import { InstallmentDue } from './entities/installment-due.entity';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [TypeOrmModule.forFeature([InstallmentPlan, InstallmentDue]), CustomersModule],
  controllers: [InstallmentsController],
  providers: [InstallmentsService],
  exports: [InstallmentsService],
})
export class InstallmentsModule {}
