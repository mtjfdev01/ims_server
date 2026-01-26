import { FindOptionsWhere } from 'typeorm';

/**
 * Adds is_archived filter to where conditions
 */
export function excludeArchived<T>(where: FindOptionsWhere<T> = {}): FindOptionsWhere<T> {
  return {
    ...where,
    is_archived: false,
  } as FindOptionsWhere<T>;
}
