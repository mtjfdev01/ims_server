import { IsInt, IsNumber, IsOptional, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePurchaseDto {
  @IsInt()
  @Type(() => Number)
  itemId: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  purchasePrice: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity?: number;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  shopId?: number;
}
