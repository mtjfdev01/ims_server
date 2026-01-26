import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
  ) {}

  create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    const category = this.categoryRepository.create(createCategoryDto);
    return this.categoryRepository.save(category);
  }

  findAll(): Promise<Category[]> {
    return this.categoryRepository.find({ where: { is_archived: false } });
  }

  findOne(id: number): Promise<Category | null> {
    return this.categoryRepository.findOne({ where: { id, is_archived: false } });
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto): Promise<Category | null> {
    await this.categoryRepository.update(id, updateCategoryDto);
    return this.findOne(id);
  }

  async remove(id: number): Promise<boolean> {
    const category = await this.categoryRepository.findOne({
      where: { id, is_archived: false },
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
