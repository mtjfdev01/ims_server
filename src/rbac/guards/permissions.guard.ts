import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getAuthUser, UserRole } from '../../common/request-context';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Permission } from '../permissions';
import { roleHasPermission } from '../role-permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const permissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permissions?.length) {
      return true;
    }

    const user = getAuthUser(context.switchToHttp().getRequest());
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    const missing = permissions.filter(permission => !roleHasPermission(user.role, permission));
    if (missing.length) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return true;
  }
}
