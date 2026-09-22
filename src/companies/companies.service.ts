import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from './entities/company.entity';
import { Category } from '../category/entities/category.entity';
import { FilterDto } from '../common/filter.dto';
import { paginateQuery } from '../common/pagination.util';
import { applyTenantScope, canAccessOptionalShopRecord, stampOwnership, tenantWhere } from '../common/access.util';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private companiesRepository: Repository<Company>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
  ) {}

  async create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    const company = this.companiesRepository.create({
      name: createCompanyDto.name,
    });
    stampOwnership(company);

    if (createCompanyDto.categories && createCompanyDto.categories.length > 0) {
        const categories = await this.categoryRepository.find({
          where: tenantWhere({ id: In(createCompanyDto.categories) }),
        });
      company.categories = categories;
    }

    return this.companiesRepository.save(company);
  }

  findAll(filterDto?: FilterDto) {
    const queryBuilder = this.companiesRepository.createQueryBuilder('company')
      .leftJoinAndSelect('company.categories', 'categories')
      .where('company.is_archived = :archived', { archived: false });
    applyTenantScope(queryBuilder, 'company');
    if (filterDto?.search?.trim()) {
      queryBuilder.andWhere('company.name ILIKE :term', { term: `%${filterDto.search.trim()}%` });
    }
    queryBuilder.orderBy('company.name', 'ASC');
    return paginateQuery(queryBuilder, filterDto);
  }

  async findOne(id: number): Promise<Company | null> {
    const company = await this.companiesRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['categories', 'items', 'items.shop'],
    });
    if (!company) {
      return null;
    }
    if (company.items) {
      company.items = company.items.filter(item => !item.is_archived && canAccessOptionalShopRecord(item.shop?.id));
    }
    return company;
  }

  async update(id: number, updateCompanyDto: UpdateCompanyDto): Promise<Company | null> {
    const company = await this.companiesRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['categories'],
    });

    if (!company) {
      return null;
    }

    if (updateCompanyDto.name !== undefined) {
      company.name = updateCompanyDto.name;
    }

    if (updateCompanyDto.categories !== undefined) {
      if (updateCompanyDto.categories.length > 0) {
        const categories = await this.categoryRepository.find({
          where: tenantWhere({ id: In(updateCompanyDto.categories) }),
        });
        company.categories = categories;
      } else {
        company.categories = [];
      }
    }

    return this.companiesRepository.save(company);
  }

  async remove(id: number): Promise<boolean> {
    const company = await this.companiesRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
    });

    if (!company) {
      return false;
    }

    // Soft delete: mark as archived instead of deleting
    company.is_archived = true;
    await this.companiesRepository.save(company);
    return true;
  }
}
