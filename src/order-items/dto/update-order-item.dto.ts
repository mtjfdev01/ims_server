import { PartialType } from '@nestjs/mapped-types';
import { CreateOrderItemDto } from './create-order-item.dto';
import { IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateOrderItemDto extends PartialType(CreateOrderItemDto) {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  returnedQuantity?: number;
}
