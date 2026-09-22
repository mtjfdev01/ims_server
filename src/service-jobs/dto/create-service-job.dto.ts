import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { INSTALLMENT_FREQUENCIES } from '../../common/payment.util';
import { NewCustomerDto } from '../../sales/dto/create-sale.dto';

export class CreateServiceJobDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  kind?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

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

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountPaid?: number;

  @IsOptional()
  @IsDateString()
  promiseDate?: string;

  @IsOptional()
  @IsIn(INSTALLMENT_FREQUENCIES)
  installmentFrequency?: (typeof INSTALLMENT_FREQUENCIES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  installmentAmount?: number;
}
