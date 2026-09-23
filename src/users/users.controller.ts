import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { IsArray, IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { Permission } from '../rbac/permissions';
import { UserRole } from '../common/request-context';

class AdminCreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tenantId?: number;

  @IsOptional()
  @IsString()
  tenantName?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  shopIds?: number[];

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

class AssignRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}

class AssignShopsDto {
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  shopIds: number[];
}

class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  password: string;
}

class AdminUpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  shopIds?: number[];

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

@Controller('users')
@RequirePermissions(Permission.USERS_MANAGE)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAllForAdmin();
  }

  @Get('tenants')
  findTenants() {
    return this.usersService.findAllTenants();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOneForAdmin(+id);
  }

  @Post()
  create(@Body() body: AdminCreateUserDto) {
    return this.usersService.adminCreateUser(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: AdminUpdateUserDto) {
    return this.usersService.updateUser(+id, body);
  }

  @Patch(':id/role')
  assignRole(@Param('id') id: string, @Body() body: AssignRoleDto) {
    return this.usersService.assignRole(+id, body.role);
  }

  @Get(':id/password')
  @RequirePermissions(Permission.USERS_PASSWORD)
  revealPassword(@Param('id') id: string) {
    return this.usersService.revealPassword(+id);
  }

  @Patch(':id/shops')
  assignShops(@Param('id') id: string, @Body() body: AssignShopsDto) {
    return this.usersService.assignShops(+id, body.shopIds || []);
  }

  @Patch(':id/password')
  @RequirePermissions(Permission.USERS_PASSWORD)
  resetPassword(@Param('id') id: string, @Body() body: ResetPasswordDto) {
    return this.usersService.resetPassword(+id, body.password);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.usersService.archiveUser(+id);
    if (!result) {
      throw new NotFoundException('User not found');
    }
    return { message: 'User archived' };
  }
}
