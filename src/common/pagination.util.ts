import { Repository, FindOptionsWhere, ObjectLiteral } from 'typeorm';
import { PaginationDto, PaginationResult } from './pagination.dto';
import { FilterDto } from './filter.dto';
import { buildFilterWhere, DateFilterOptions } from './filter.util';

export async function paginate<T extends ObjectLiteral>(
  repository: Repository<T>,
  paginationDto: PaginationDto,
  where?: FindOptionsWhere<T>,
  relations?: string[],
): Promise<PaginationResult<T>> {
  const page = paginationDto.page || 1;
  const limit = paginationDto.limit || 10;
  const skip = (page - 1) * limit;

  const [data, total] = await repository.findAndCount({
    where,
    relations,
    skip,
    take: limit,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    data,
    total,
    page,
    limit,
    totalPages,
  };
}

/**
 * Paginate with filters (date, search, etc.)
 */
export async function paginateWithFilters<T extends ObjectLiteral>(
  repository: Repository<T>,
  filterDto: FilterDto,
  baseWhere?: FindOptionsWhere<T>,
  relations?: string[],
  dateFilterOptions?: DateFilterOptions,
): Promise<PaginationResult<T>> {
  // Build where conditions with filters
  const where = buildFilterWhere(filterDto, baseWhere, dateFilterOptions);
  
  // Use the base paginate function
  return paginate(repository, filterDto, where, relations);
}
