import { FindOptionsWhere, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { FilterDto } from './filter.dto';

export interface DateFilterOptions {
  dateField?: string; // Field name for date filtering (e.g., 'createdAt', 'date', 'issuedDate')
}

/**
 * Builds TypeORM where conditions based on filter DTO
 * @param filterDto Filter DTO containing date filters
 * @param baseWhere Base where conditions
 * @param options Date filter options
 * @returns Combined where conditions
 */
export function buildFilterWhere<T>(
  filterDto: FilterDto,
  baseWhere: FindOptionsWhere<T> = {},
  options: DateFilterOptions = {},
): FindOptionsWhere<T> {
  const where: FindOptionsWhere<T> = { ...baseWhere };
  const dateField = options.dateField || 'createdAt';

  // Single date filter
  if (filterDto.date) {
    const date = new Date(filterDto.date);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    where[dateField] = Between(startOfDay, endOfDay) as any;
  }
  // Date range filter
  else if (filterDto.dateFrom || filterDto.dateTo) {
    if (filterDto.dateFrom && filterDto.dateTo) {
      // Both from and to dates provided
      const fromDate = new Date(filterDto.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      const toDate = new Date(filterDto.dateTo);
      toDate.setHours(23, 59, 59, 999);
      
      where[dateField] = Between(fromDate, toDate) as any;
    } else if (filterDto.dateFrom) {
      // Only from date
      const fromDate = new Date(filterDto.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      where[dateField] = MoreThanOrEqual(fromDate) as any;
    } else if (filterDto.dateTo) {
      // Only to date
      const toDate = new Date(filterDto.dateTo);
      toDate.setHours(23, 59, 59, 999);
      where[dateField] = LessThanOrEqual(toDate) as any;
    }
  }

  // Search field (for future use - can be extended)
  // if (filterDto.search) {
  //   // Add search conditions here based on entity
  // }

  return where;
}
