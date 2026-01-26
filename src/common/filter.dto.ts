import { IsOptional, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from './pagination.dto';

export class FilterDto extends PaginationDto {
  @IsOptional()
  @IsDateString()
  date?: string; // Single date filter

  @IsOptional()
  @IsDateString()
  dateFrom?: string; // Date range start

  @IsOptional()
  @IsDateString()
  dateTo?: string; // Date range end

  @IsOptional()
  search?: string; // Search field (for future use)
}
