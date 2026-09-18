import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { Permission } from '../rbac/permissions';

@Controller('companies')
@RequirePermissions(Permission.COMPANIES_READ)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @RequirePermissions(Permission.COMPANIES_WRITE)
  async create(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.create(createCompanyDto);
  }

  @Get()
  async findAll() {
    return this.companiesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const company = await this.companiesService.findOne(+id);
    if (!company) {
      return { error: 'Company not found' };
    }
    return company;
  }

  @Patch(':id')
  @RequirePermissions(Permission.COMPANIES_WRITE)
  async update(@Param('id') id: string, @Body() updateCompanyDto: UpdateCompanyDto) {
    const company = await this.companiesService.update(+id, updateCompanyDto);
    if (!company) {
      return { error: 'Company not found' };
    }
    return company;
  }

  @Delete(':id')
  @RequirePermissions(Permission.COMPANIES_DELETE)
  async remove(@Param('id') id: string) {
    const result = await this.companiesService.remove(+id);
    if (!result) {
      return { error: 'Company not found' };
    }
    return { message: 'Company deleted successfully' };
  }
}
