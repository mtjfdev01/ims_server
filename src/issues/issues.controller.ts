import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { IssuesService } from './issues.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';

@Controller('issues')
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Post()
  async create(@Body() createIssueDto: CreateIssueDto) {
    try {
      return await this.issuesService.create(createIssueDto);
    } catch (error) {
      return { error: error.message };
    }
  }

  @Get()
  async findAll() {
    return this.issuesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const issue = await this.issuesService.findOne(+id);
    if (!issue) {
      return { error: 'Issue not found' };
    }
    return issue;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateIssueDto: UpdateIssueDto) {
    const issue = await this.issuesService.update(+id, updateIssueDto);
    if (!issue) {
      return { error: 'Issue not found' };
    }
    return issue;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.issuesService.remove(+id);
    if (!result) {
      return { error: 'Issue not found' };
    }
    return { message: 'Issue deleted successfully' };
  }
}
