import { IsArray, ValidateNested, ArrayMinSize, IsOptional, IsEnum, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from '../../order-items/dto/create-order-item.dto';
import { OrderStatus } from '../entities/order.entity';

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Order must have at least one item' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  shopId?: number;
}
