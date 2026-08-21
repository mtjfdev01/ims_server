import { IsInt, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSaleItemDto {
  @IsInt()
  @Type(() => Number)
  itemId: number;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  profit?: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;
}
