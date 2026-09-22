import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { FilterDto } from '../common/filter.dto';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { Permission } from '../rbac/permissions';

@Controller('category')
@RequirePermissions(Permission.CATEGORIES_READ)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @RequirePermissions(Permission.CATEGORIES_WRITE)
  async create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.create(createCategoryDto);
  }

  @Get()
  async findAll(@Query() filterDto: FilterDto) {
    return this.categoryService.findAll(filterDto);
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
  @RequirePermissions(Permission.CATEGORIES_WRITE)
  async update(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) {
    const category = await this.categoryService.update(+id, updateCategoryDto);
    if (!category) {
      return { error: 'Category not found' };
    }
    return category;
  }

  @Delete(':id')
  @RequirePermissions(Permission.CATEGORIES_DELETE)
  async remove(@Param('id') id: string) {
    const result = await this.categoryService.remove(+id);
    if (!result) {
      return { error: 'Category not found' };
    }
    return { message: 'Category deleted successfully' };
  }
}
