import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';
import { FilterDto } from '../common/filter.dto';
import { paginateQuery } from '../common/pagination.util';
import { applyTenantScope, stampOwnership, tenantWhere } from '../common/access.util';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
  ) {}

  create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    const category = this.categoryRepository.create(createCategoryDto);
    stampOwnership(category);
    return this.categoryRepository.save(category);
  }

  findAll(filterDto?: FilterDto) {
    const queryBuilder = this.categoryRepository.createQueryBuilder('category')
      .where('category.is_archived = :archived', { archived: false });
    applyTenantScope(queryBuilder, 'category');
    if (filterDto?.search?.trim()) {
      queryBuilder.andWhere('category.name ILIKE :term', { term: `%${filterDto.search.trim()}%` });
    }
    queryBuilder.orderBy('category.name', 'ASC');
    return paginateQuery(queryBuilder, filterDto);
  }

  findOne(id: number): Promise<Category | null> {
    return this.categoryRepository.findOne({ where: tenantWhere({ id, is_archived: false }) });
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto): Promise<Category | null> {
    const category = await this.findOne(id);
    if (!category) {
      return null;
    }
    await this.categoryRepository.update(tenantWhere({ id, is_archived: false }), updateCategoryDto);
    return this.findOne(id);
  }

  async remove(id: number): Promise<boolean> {
    const category = await this.categoryRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
    });

    if (!category) {
      return false;
    }

    // Soft delete: mark as archived instead of deleting
    category.is_archived = true;
    await this.categoryRepository.save(category);
    return true;
  }
}
