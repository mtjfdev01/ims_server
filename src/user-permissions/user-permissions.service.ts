import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPermission } from './entities/user-permission.entity';
import { User } from '../users/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { APP_MODULES, defaultModulesForRole, isAppModule, withStockTransfersModule } from './app-modules';
import { UserRole } from '../common/request-context';
import { requireUser } from '../common/access.util';

@Injectable()
export class UserPermissionsService {
  constructor(
    @InjectRepository(UserPermission)
    private permissionsRepository: Repository<UserPermission>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  listCatalog() {
    return APP_MODULES;
  }

  async modulesForUser(user: User): Promise<string[]> {
    if (user.role === UserRole.SUPER_ADMIN) {
      return APP_MODULES.map(module => module.key);
    }
    const rows = await this.permissionsRepository.find({
      where: { user: { id: user.id } },
    });
    if (rows.length) {
      const current = rows.map(row => row.module);
      const next = withStockTransfersModule(current).filter(isAppModule);
      if (next.length !== current.length || next.some((module, index) => module !== current[index])) {
        return this.replaceModules(user, next);
      }
      return next;
    }
    return this.replaceModules(user, defaultModulesForRole(user.role));
  }

  async listOrganizationUsers(tenantId?: number) {
    const actor = this.requireManager();
    const scopedTenantId = actor.role === UserRole.SUPER_ADMIN
      ? (tenantId || actor.viewTenantId || null)
      : actor.tenantId;
    if (actor.role !== UserRole.SUPER_ADMIN && !scopedTenantId) {
      throw new ForbiddenException('Your account is not assigned to an organization');
    }

    const query = this.usersRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.tenant', 'tenant')
      .leftJoinAndSelect('user.shops', 'shops')
      .where('user.is_archived = :archived', { archived: false })
      .andWhere('user.role != :superAdmin', { superAdmin: UserRole.SUPER_ADMIN })
      .orderBy('user.name', 'ASC');
    if (scopedTenantId) {
      query.andWhere('user.tenant_id = :tenantId', { tenantId: scopedTenantId });
    }

    const users = await query.getMany();
    const permissionRows = users.length
      ? await this.permissionsRepository.createQueryBuilder('permission')
        .leftJoinAndSelect('permission.user', 'user')
        .where('permission.user_id IN (:...userIds)', { userIds: users.map(user => user.id) })
        .getMany()
      : [];
    const modulesByUser = new Map<number, string[]>();
    permissionRows.forEach((row) => {
      const userId = row.user?.id;
      if (!userId) {
        return;
      }
      const current = modulesByUser.get(userId) || [];
      current.push(row.module);
      modulesByUser.set(userId, current);
    });

    return {
      modules: APP_MODULES,
      users: users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenant: user.tenant ? { id: user.tenant.id, name: user.tenant.name } : null,
        shops: (user.shops || []).map(shop => ({ id: shop.id, name: shop.name })),
        permissions: withStockTransfersModule(modulesByUser.get(user.id) || defaultModulesForRole(user.role)),
      })),
    };
  }

  async setUserModules(userId: number, modules: string[]) {
    const actor = this.requireManager();
    const user = await this.usersRepository.findOne({
      where: { id: userId, is_archived: false },
      relations: ['tenant'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Super admin access cannot be changed');
    }
    if (actor.role !== UserRole.SUPER_ADMIN && Number(user.tenant?.id) !== Number(actor.tenantId)) {
      throw new ForbiddenException('You can only change users in your organization');
    }

    const unique = [...new Set((modules || []).map(value => String(value).trim()).filter(Boolean))];
    const invalid = unique.filter(value => !isAppModule(value));
    if (invalid.length) {
      throw new BadRequestException(`Unknown module: ${invalid.join(', ')}`);
    }

    await this.replaceModules(user, unique);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: unique,
    };
  }

  async seedDefaults(user: User): Promise<string[]> {
    return this.modulesForUser(user);
  }

  private async replaceModules(user: User, modules: string[]): Promise<string[]> {
    await this.permissionsRepository.delete({ user: { id: user.id } });
    if (modules.length) {
      const rows = modules.map(module => this.permissionsRepository.create({
        user: { id: user.id } as User,
        tenant: user.tenant ? { id: user.tenant.id } as Tenant : null,
        module,
      }));
      await this.permissionsRepository.save(rows);
    }
    return modules;
  }

  private requireManager() {
    const user = requireUser();
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.TENANT_ADMIN) {
      throw new ForbiddenException('Only organization admins can manage user permissions');
    }
    return user;
  }
}
