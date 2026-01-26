import { IsArray, ValidateNested, ArrayMinSize, IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSaleItemDto } from '../../sale-items/dto/create-sale-item.dto';

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
}
