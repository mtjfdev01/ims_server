import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { INSTALLMENT_SCHEDULES } from '../../common/payment.util';
import { NewCustomerDto } from '../../sales/dto/create-sale.dto';

export class CreateInstallmentPlanDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  totalAmount: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  downPayment?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  installmentCount: number;

  @IsOptional()
  @IsIn(INSTALLMENT_SCHEDULES)
  schedule?: (typeof INSTALLMENT_SCHEDULES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  @IsDateString()
  firstDueDate: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  shopId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  customerId?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewCustomerDto)
  newCustomer?: NewCustomerDto;
}
