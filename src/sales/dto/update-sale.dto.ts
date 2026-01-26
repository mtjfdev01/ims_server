import { IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSaleItemDto } from '../../sale-items/dto/create-sale-item.dto';

export class UpdateSaleDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items?: CreateSaleItemDto[];
}
