import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ServiceJobsService } from './service-jobs.service';
import { CreateServiceJobDto } from './dto/create-service-job.dto';
import { UpdateServiceJobDto } from './dto/update-service-job.dto';
import { CreateServicePaymentDto } from '../service-payments/dto/create-service-payment.dto';
import { FilterDto } from '../common/filter.dto';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { Permission } from '../rbac/permissions';

@Controller('services')
@RequirePermissions(Permission.SERVICES_READ)
export class ServiceJobsController {
  constructor(private readonly serviceJobsService: ServiceJobsService) {}

  @Post()
  @RequirePermissions(Permission.SERVICES_WRITE)
  create(@Body() dto: CreateServiceJobDto) {
    return this.serviceJobsService.create(dto);
  }

  @Get()
  findAll(@Query() filterDto: FilterDto, @Query('shopId') shopId?: string) {
    return this.serviceJobsService.findAll(filterDto, shopId ? +shopId : undefined);
  }

  @Get('totals')
  getTotals(@Query() filterDto: FilterDto, @Query('shopId') shopId?: string) {
    return this.serviceJobsService.getTotals(filterDto, shopId ? +shopId : undefined);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const job = await this.serviceJobsService.findOne(+id);
    if (!job) {
      return { error: 'Service not found' };
    }
    return job;
  }

  @Post(':id/payments')
  @RequirePermissions(Permission.SERVICES_WRITE)
  async addPayment(@Param('id') id: string, @Body() dto: CreateServicePaymentDto) {
    const job = await this.serviceJobsService.addPayment(+id, dto);
    if (!job) {
      return { error: 'Service not found' };
    }
    return job;
  }

  @Patch(':id')
  @RequirePermissions(Permission.SERVICES_WRITE)
  async update(@Param('id') id: string, @Body() dto: UpdateServiceJobDto) {
    const job = await this.serviceJobsService.update(+id, dto);
    if (!job) {
      return { error: 'Service not found' };
    }
    return job;
  }

  @Delete(':id')
  @RequirePermissions(Permission.SERVICES_DELETE)
  async remove(@Param('id') id: string) {
    const result = await this.serviceJobsService.remove(+id);
    if (!result) {
      return { error: 'Service not found' };
    }
    return { message: 'Service deleted successfully' };
  }
}
