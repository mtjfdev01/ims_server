import { IsOptional, IsArray, ValidateNested, IsInt, IsNumber, IsIn, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSaleItemDto } from '../../sale-items/dto/create-sale-item.dto';
import { INSTALLMENT_FREQUENCIES } from '../../common/payment.util';

export class UpdateSaleDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items?: CreateSaleItemDto[];

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
