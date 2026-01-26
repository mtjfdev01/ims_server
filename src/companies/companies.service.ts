import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from './entities/company.entity';
import { Category } from '../category/entities/category.entity';

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

    if (createCompanyDto.categories && createCompanyDto.categories.length > 0) {
      const categories = await this.categoryRepository.findBy({
        id: In(createCompanyDto.categories),
      });
      company.categories = categories;
    }

    return this.companiesRepository.save(company);
  }

  findAll(): Promise<Company[]> {
    return this.companiesRepository.find({
      where: { is_archived: false },
      relations: ['categories', 'items'],
    });
  }

  findOne(id: number): Promise<Company | null> {
    return this.companiesRepository.findOne({
      where: { id, is_archived: false },
      relations: ['categories', 'items'],
    });
  }

  async update(id: number, updateCompanyDto: UpdateCompanyDto): Promise<Company | null> {
    const company = await this.companiesRepository.findOne({
      where: { id, is_archived: false },
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
        const categories = await this.categoryRepository.findBy({
          id: In(updateCompanyDto.categories),
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
      where: { id, is_archived: false },
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
