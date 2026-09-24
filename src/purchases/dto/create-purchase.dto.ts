import { IsInt, IsNumber, IsOptional, IsDateString, IsString, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class NewSellerDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  cnic?: string;
}

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

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsInt()
  @Transform(({ value }) => (value === null || value === '' || value === undefined ? null : Number(value)))
  sellerId?: number | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewSellerDto)
  newSeller?: NewSellerDto;
}
