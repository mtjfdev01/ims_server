import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { InstallmentsService } from './installments.service';
import { CreateInstallmentPlanDto } from './dto/create-installment-plan.dto';
import { UpdateInstallmentPlanDto } from './dto/update-installment-plan.dto';
import { PayInstallmentDueDto } from './dto/pay-installment-due.dto';
import { FilterDto } from '../common/filter.dto';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { Permission } from '../rbac/permissions';

@Controller('installments')
@RequirePermissions(Permission.INSTALLMENTS_READ)
export class InstallmentsController {
  constructor(private readonly installmentsService: InstallmentsService) {}

  @Get()
  findDues(@Query() filterDto: FilterDto, @Query('shopId') shopId?: string) {
    return this.installmentsService.findDues(filterDto, shopId ? +shopId : undefined);
  }

  @Get('totals')
  getTotals(@Query() filterDto: FilterDto, @Query('shopId') shopId?: string) {
    return this.installmentsService.getTotals(filterDto, shopId ? +shopId : undefined);
  }

  @Get('plans')
  findPlans(@Query() filterDto: FilterDto, @Query('shopId') shopId?: string) {
    return this.installmentsService.findPlans(filterDto, shopId ? +shopId : undefined);
  }

  @Post('plans')
  @RequirePermissions(Permission.INSTALLMENTS_WRITE)
  createPlan(@Body() dto: CreateInstallmentPlanDto) {
    return this.installmentsService.createPlan(dto);
  }

  @Get('plans/:id')
  async findPlan(@Param('id') id: string) {
    const plan = await this.installmentsService.findPlan(+id);
    if (!plan) {
      return { error: 'Installment plan not found' };
    }
    return plan;
  }

  @Patch('plans/:id')
  @RequirePermissions(Permission.INSTALLMENTS_WRITE)
  async updatePlan(@Param('id') id: string, @Body() dto: UpdateInstallmentPlanDto) {
    const plan = await this.installmentsService.updatePlan(+id, dto);
    if (!plan) {
      return { error: 'Installment plan not found' };
    }
    return plan;
  }

  @Delete('plans/:id')
  @RequirePermissions(Permission.INSTALLMENTS_DELETE)
  async removePlan(@Param('id') id: string) {
    const result = await this.installmentsService.removePlan(+id);
    if (!result) {
      return { error: 'Installment plan not found' };
    }
    return { message: 'Installment plan deleted successfully' };
  }

  @Post('dues/:id/pay')
  @RequirePermissions(Permission.INSTALLMENTS_WRITE)
  async payDue(@Param('id') id: string, @Body() dto: PayInstallmentDueDto) {
    const due = await this.installmentsService.payDue(+id, dto);
    if (!due) {
      return { error: 'Installment not found' };
    }
    return due;
  }
}
