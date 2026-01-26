import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  async create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.create(createCategoryDto);
  }

  @Get()
  async findAll() {
    return this.categoryService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const category = await this.categoryService.findOne(+id);
    if (!category) {
      return { error: 'Category not found' };
    }
    return category;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) {
    const category = await this.categoryService.update(+id, updateCategoryDto);
    if (!category) {
      return { error: 'Category not found' };
    }
    return category;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.categoryService.remove(+id);
    if (!result) {
      return { error: 'Category not found' };
    }
    return { message: 'Category deleted successfully' };
  }
}
