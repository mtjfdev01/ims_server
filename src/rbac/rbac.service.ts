import { Injectable } from '@nestjs/common';
import { UserRole } from '../common/request-context';
import { ALL_PERMISSIONS, Permission } from './permissions';
import { ASSIGNABLE_ROLES, permissionsForRole, roleHasPermission } from './role-permissions';

@Injectable()
export class RbacService {
  listPermissions(): Permission[] {
    return ALL_PERMISSIONS;
  }

  listAssignableRoles(): UserRole[] {
    return ASSIGNABLE_ROLES;
  }

  permissionsForRole(role: UserRole): Permission[] {
    return permissionsForRole(role);
  }

  hasPermission(role: UserRole, permission: Permission): boolean {
    return roleHasPermission(role, permission);
  }
}
