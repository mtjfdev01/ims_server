import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { signAuthToken } from '../common/token.util';
import { UserRole } from '../common/request-context';
import { BILLING_CHECK_BYPASS, BILLING_INTERVAL } from '../billing/billing.config';
import { permissionsForRole } from '../rbac/role-permissions';

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await this.usersService.validatePassword(user, loginDto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = signAuthToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenant: user.tenant ? { id: user.tenant.id, name: user.tenant.name } : null,
        shops: user.shops ? user.shops.map(shop => ({ id: shop.id, name: shop.name })) : [],
        permissions: permissionsForRole(user.role),
        billing: {
          interval: BILLING_INTERVAL,
          bypassed: BILLING_CHECK_BYPASS,
          active: user.role === UserRole.SUPER_ADMIN || BILLING_CHECK_BYPASS || !!user.tenant?.billingActive,
        },
      },
    };
  }
}
