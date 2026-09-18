import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from '../users/users.service';
import { verifyAuthToken } from '../common/token.util';
import { AuthUser, UserRole, attachAuthUser, getAuthUser } from '../common/request-context';
import { BILLING_CHECK_BYPASS } from '../billing/billing.config';

@Injectable()
export class AuthContextService {
  constructor(private usersService: UsersService) {}

  async resolveFromRequest(req: object): Promise<AuthUser> {
    const existing = getAuthUser(req);
    if (existing) {
      return existing;
    }

    const header = (req as Request).headers?.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication required');
    }

    let payload: Record<string, unknown>;
    try {
      payload = verifyAuthToken(header.slice(7));
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const user = await this.usersService.findById(Number(payload.sub));
    if (!user || user.is_archived) {
      throw new UnauthorizedException('User not found');
    }

    const request = req as Request;
    const viewTenantHeader = request.headers['x-tenant-id'];
    const viewTenantQuery = request.query?.tenantId;
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
        throw new HttpException('Monthly billing is not active for this account', HttpStatus.PAYMENT_REQUIRED);
      }
    }

    attachAuthUser(req, authUser);
    return authUser;
  }
}
