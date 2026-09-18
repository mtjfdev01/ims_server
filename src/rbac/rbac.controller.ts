import { Controller, Get } from '@nestjs/common';
import { getAuthUser } from '../common/request-context';
import { RequirePermissions } from './decorators/permissions.decorator';
import { Permission } from './permissions';
import { RbacService } from './rbac.service';
import { permissionsForRole } from './role-permissions';

@Controller('rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('me')
  me() {
    const user = getAuthUser();
    return {
      role: user?.role,
      permissions: user ? permissionsForRole(user.role) : [],
    };
  }

  @Get('roles')
  @RequirePermissions(Permission.USERS_MANAGE)
  roles() {
    return this.rbacService.listAssignableRoles();
  }

  @Get('permissions')
  @RequirePermissions(Permission.USERS_MANAGE)
  permissions() {
    return this.rbacService.listPermissions();
  }
}
