import { HttpException, HttpStatus, Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { UsersService } from '../users/users.service';
import { verifyAuthToken } from '../common/token.util';
import { AuthUser, UserRole, attachAuthUser, runWithAuthUser } from '../common/request-context';
import { BILLING_CHECK_BYPASS } from '../billing/billing.config';

const PUBLIC_PATHS = ['/auth/login', '/', '/health'];

@Injectable()
export class AuthContextMiddleware implements NestMiddleware {
  constructor(private usersService: UsersService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const path = req.path || req.url?.split('?')[0] || '';
    if (req.method === 'OPTIONS' || PUBLIC_PATHS.some(publicPath => path === publicPath || path.startsWith(`${publicPath}/`))) {
      return next();
    }

    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return next(new UnauthorizedException('Authentication required'));
    }

    let payload: Record<string, unknown>;
    try {
      payload = verifyAuthToken(header.slice(7));
    } catch {
      return next(new UnauthorizedException('Invalid or expired session'));
    }

    const user = await this.usersService.findById(Number(payload.sub));
    if (!user || user.is_archived) {
      return next(new UnauthorizedException('User not found'));
    }

    const viewTenantHeader = req.headers['x-tenant-id'];
    const viewTenantQuery = req.query.tenantId;
    const requestedTenant = Number(viewTenantHeader || viewTenantQuery || 0) || null;

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenant?.id || null,
      shopIds: (user.shops || []).filter(shop => !shop.is_archived).map(shop => shop.id),
      viewTenantId: user.role === UserRole.SUPER_ADMIN ? requestedTenant : null,
    };

    if (authUser.role !== UserRole.SUPER_ADMIN && !BILLING_CHECK_BYPASS) {
      const tenant = user.tenant;
      const billingOk = tenant?.billingActive && (
        !tenant.subscriptionValidUntil || new Date(tenant.subscriptionValidUntil) > new Date()
      );
      if (!billingOk) {
        return next(new HttpException('Monthly billing is not active for this account', HttpStatus.PAYMENT_REQUIRED));
      }
    }

    attachAuthUser(req, authUser);
    runWithAuthUser(authUser, () => next());
  }
}
