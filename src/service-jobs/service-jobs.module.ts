import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceJobsService } from './service-jobs.service';
import { ServiceJobsController } from './service-jobs.controller';
import { ServiceJob } from './entities/service-job.entity';
import { ServicePayment } from '../service-payments/entities/service-payment.entity';
import { Shop } from '../shops/entities/shop.entity';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceJob, ServicePayment]), CustomersModule],
  controllers: [ServiceJobsController],
  providers: [ServiceJobsService],
})
export class ServiceJobsModule {}
