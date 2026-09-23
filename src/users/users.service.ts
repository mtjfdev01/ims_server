import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Shop } from '../shops/entities/shop.entity';
import { UserRole } from '../common/request-context';
import { isSuperAdmin, requireTenantId, requireUser } from '../common/access.util';
import { ASSIGNABLE_ROLES } from '../rbac/role-permissions';
import { UserPermissionsService } from '../user-permissions/user-permissions.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(Shop)
    private shopRepository: Repository<Shop>,
    private userPermissionsService: UserPermissionsService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = this.usersRepository.create({
      email: createUserDto.email,
      name: createUserDto.name,
      password: hashedPassword,
      role: UserRole.USER,
    });
    return this.usersRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email, is_archived: false },
      relations: ['shops', 'tenant'],
    });
  }

  async findById(id: number): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id, is_archived: false },
      relations: ['shops', 'tenant'],
    });
  }

  async findOneForAdmin(id: number): Promise<any> {
    this.assertSuperAdmin();
    const user = await this.findById(id);
    if (!user || user.role === UserRole.SUPER_ADMIN) {
      throw new NotFoundException('User not found');
    }
    return this.toAdminUser(user);
  }

  async findAllForAdmin(): Promise<any[]> {
    this.assertSuperAdmin();
    const users = await this.usersRepository.find({
      where: { is_archived: false },
      relations: ['shops', 'tenant'],
      order: { id: 'ASC' },
    });
    return users.map(user => this.toAdminUser(user));
  }

  async adminCreateUser(body: {
    email: string;
    name: string;
    password: string;
    tenantId?: number;
    tenantName?: string;
    shopIds?: number[];
    role?: UserRole;
  }): Promise<any> {
    this.assertSuperAdmin();
    const existing = await this.usersRepository.findOne({ where: { email: body.email } });
    if (existing) {
      throw new BadRequestException('A user with this email already exists');
    }

    let tenant: Tenant | null = null;
    if (body.tenantId) {
      tenant = await this.tenantRepository.findOne({ where: { id: body.tenantId, is_archived: false } });
      if (!tenant) {
        throw new BadRequestException('Organization not found');
      }
    } else {
      tenant = await this.tenantRepository.save(this.tenantRepository.create({
        name: body.tenantName || `${body.name}'s organization`,
        billingActive: true,
      }));
    }

    const role = this.resolveAssignableRole(body.role);
    const hashedPassword = await bcrypt.hash(body.password, 10);
    const user = this.usersRepository.create({
      email: body.email,
      name: body.name,
      password: hashedPassword,
      visiblePassword: body.password,
      role,
      tenant,
    });

    const requestedShopIds = (body.shopIds || []).map(Number).filter(id => Number.isFinite(id));
    if (requestedShopIds.length) {
      const shops = await this.shopRepository.find({
        where: { id: In(requestedShopIds), is_archived: false },
        relations: ['tenant'],
      });
      const invalid = shops.filter(shop => shop.tenant && shop.tenant.id !== tenant.id);
      if (invalid.length) {
        throw new BadRequestException('Shops must belong to the same organization as the user');
      }
      user.shops = shops;
    }

    const saved = await this.usersRepository.save(user);
    const created = await this.findById(saved.id) as User;
    await this.userPermissionsService.seedDefaults(created);
    return this.toAdminUser(created);
  }

  async updateUser(userId: number, body: {
    email?: string;
    name?: string;
    role?: UserRole;
    shopIds?: number[];
    password?: string;
  }): Promise<any> {
    this.assertSuperAdmin();
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Cannot update the super admin');
    }

    if (body.email && body.email !== user.email) {
      const existing = await this.usersRepository.findOne({ where: { email: body.email } });
      if (existing) {
        throw new BadRequestException('A user with this email already exists');
      }
      user.email = body.email;
    }
    if (body.name) {
      user.name = body.name;
    }
    if (body.role) {
      user.role = this.resolveAssignableRole(body.role);
    }
    if (body.password) {
      user.password = await bcrypt.hash(body.password, 10);
      user.visiblePassword = body.password;
    }
    await this.usersRepository.save(user);

    if (body.shopIds) {
      return this.assignShops(userId, body.shopIds);
    }
    return this.toAdminUser(await this.findById(user.id) as User);
  }

  async assignRole(userId: number, role: UserRole): Promise<any> {
    this.assertSuperAdmin();
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Cannot change the super admin role');
    }
    user.role = this.resolveAssignableRole(role);
    await this.usersRepository.save(user);
    return this.toAdminUser(await this.findById(user.id) as User);
  }

  async assignShops(userId: number, shopIds: number[]): Promise<any> {
    this.assertSuperAdmin();
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Cannot assign shops to the super admin');
    }
    if (!user.tenant) {
      throw new BadRequestException('User has no organization');
    }

    const requestedShopIds = (shopIds || []).map(Number).filter(id => Number.isFinite(id));
    const shops = requestedShopIds.length
      ? await this.shopRepository.find({
          where: { id: In(requestedShopIds), is_archived: false },
          relations: ['tenant'],
        })
      : [];
    const invalid = shops.filter(shop => shop.tenant && shop.tenant.id !== user.tenant?.id);
    if (invalid.length) {
      throw new BadRequestException('Shops must belong to the user organization');
    }
    user.shops = shops;
    await this.usersRepository.save(user);
    return this.toAdminUser(await this.findById(user.id) as User);
  }

  async resetPassword(userId: number, password: string): Promise<any> {
    this.assertSuperAdmin();
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.password = await bcrypt.hash(password, 10);
    user.visiblePassword = password;
    await this.usersRepository.save(user);
    return this.toAdminUser(await this.findById(user.id) as User);
  }

  async revealPassword(userId: number): Promise<{ password: string | null }> {
    this.assertSuperAdmin();
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { password: user.visiblePassword };
  }

  async archiveUser(userId: number): Promise<boolean> {
    this.assertSuperAdmin();
    const current = requireUser();
    if (current.id === userId) {
      throw new BadRequestException('You cannot archive your own account');
    }
    const user = await this.findById(userId);
    if (!user) {
      return false;
    }
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Cannot archive the super admin');
    }
    user.is_archived = true;
    await this.usersRepository.save(user);
    return true;
  }

  async resolveCreateTenantId(tenantId?: number, tenantName?: string): Promise<number> {
    const user = requireUser();
    if (user.role === UserRole.SUPER_ADMIN) {
      if (tenantId) {
        const tenant = await this.tenantRepository.findOne({
          where: { id: Number(tenantId), is_archived: false },
        });
        if (!tenant) {
          throw new BadRequestException('Organization not found');
        }
        return tenant.id;
      }
      if (tenantName?.trim()) {
        const tenant = await this.tenantRepository.save(this.tenantRepository.create({
          name: tenantName.trim(),
          billingActive: true,
        }));
        return tenant.id;
      }
    }
    return requireTenantId();
  }

  async findAllTenants(): Promise<Tenant[]> {
    this.assertSuperAdmin();
    return this.tenantRepository.find({
      where: { is_archived: false },
      order: { id: 'ASC' },
    });
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password);
  }

  private resolveAssignableRole(role?: UserRole): UserRole {
    if (!role || role === UserRole.USER) {
      return UserRole.USER;
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new BadRequestException('That role cannot be assigned');
    }
    return role;
  }

  private assertSuperAdmin(): void {
    if (!isSuperAdmin()) {
      throw new ForbiddenException('Super admin access required');
    }
  }

  private toAdminUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenant: user.tenant ? { id: user.tenant.id, name: user.tenant.name, billingActive: user.tenant.billingActive } : null,
      shops: (user.shops || []).map(shop => ({ id: shop.id, name: shop.name })),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
