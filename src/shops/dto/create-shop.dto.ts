import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateShopDto {
  name: string;
  branch: string;
  dealer: string;
  location: string;
  storeIds?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tenantId?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  tenantName?: string;
}
