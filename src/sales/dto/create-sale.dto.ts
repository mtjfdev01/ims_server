import { IsEmail, IsArray, ValidateNested, ArrayMinSize, IsOptional, IsInt, IsNumber, IsIn, IsDateString, Min, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSaleItemDto } from '../../sale-items/dto/create-sale-item.dto';
import { INSTALLMENT_FREQUENCIES } from '../../common/payment.util';

export class NewCustomerDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class CreateSaleDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Sale must have at least one item' })
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];

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
