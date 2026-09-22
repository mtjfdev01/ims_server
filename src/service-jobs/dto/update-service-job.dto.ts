import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { INSTALLMENT_FREQUENCIES } from '../../common/payment.util';

export class UpdateServiceJobDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  kind?: string;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  customerId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountPaid?: number;

  @IsOptional()
  @IsDateString()
  promiseDate?: string | null;

  @IsOptional()
  @IsIn(INSTALLMENT_FREQUENCIES)
  installmentFrequency?: (typeof INSTALLMENT_FREQUENCIES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  installmentAmount?: number | null;
}
