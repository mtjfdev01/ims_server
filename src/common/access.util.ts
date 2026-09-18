import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { In } from 'typeorm';
import { AuthUser, UserRole, getAuthUser } from './request-context';

export function requireUser(): AuthUser {
  const user = getAuthUser();
  if (!user) {
    throw new UnauthorizedException('Authentication required');
  }
  return user;
}

export function isSuperAdmin(user?: AuthUser): boolean {
  return (user || getAuthUser())?.role === UserRole.SUPER_ADMIN;
}

export function isTenantAdmin(user?: AuthUser): boolean {
  return (user || getAuthUser())?.role === UserRole.TENANT_ADMIN;
}

/** Super admin and org admin can act across shops in the visible tenant. */
export function skipsShopFilter(user?: AuthUser): boolean {
  const role = (user || getAuthUser())?.role;
  return role === UserRole.SUPER_ADMIN || role === UserRole.TENANT_ADMIN;
}

export function tenantWhere<T extends Record<string, any>>(extra: T = {} as T): T & { tenant?: { id: number } } {
  const user = requireUser();
  if (user.role === UserRole.SUPER_ADMIN) {
    const tenantId = user.viewTenantId;
    if (tenantId) {
      return { ...extra, tenant: { id: tenantId } };
    }
    return extra;
  }
  if (!user.tenantId) {
    return { ...extra, tenant: { id: -1 } };
  }
  return { ...extra, tenant: { id: user.tenantId } };
}

export function resolveTenantId(): number | null {
  const user = requireUser();
  if (user.role === UserRole.SUPER_ADMIN) {
    return user.viewTenantId || null;
  }
  return user.tenantId;
}

export function assertShopAccess(shopId: number): void {
  const user = requireUser();
  if (skipsShopFilter(user)) {
    return;
  }
  if (!user.shopIds.includes(Number(shopId))) {
    throw new ForbiddenException('You do not have access to this shop');
  }
}

export function requireSuperAdmin(): void {
  if (!isSuperAdmin()) {
    throw new ForbiddenException('Super admin access required');
  }
}

export function hasShopAccess(shopId?: number | null): boolean {
  if (skipsShopFilter()) {
    return true;
  }
  if (!shopId) {
    return false;
  }
  return requireUser().shopIds.includes(Number(shopId));
}

/** Shop-scoped records: hide if the user does not own the shop. */
export function canAccessShopRecord(shopId?: number | null): boolean {
  return hasShopAccess(shopId);
}

/** Store-level records: shop users cannot see warehouse items. Shop records need assignment. */
export function canAccessOptionalShopRecord(shopId?: number | null): boolean {
  if (skipsShopFilter()) {
    return true;
  }
  return hasShopAccess(shopId);
}

export function assertItemBelongsToShop(item: { shop?: { id: number } | null }, shopId: number): void {
  if (!item.shop || Number(item.shop.id) !== Number(shopId)) {
    throw new ForbiddenException('Item does not belong to this shop');
  }
}

export function canAccessIssue(issue: { fromShop?: { id: number } | null; toShop?: { id: number } | null }): boolean {
  if (skipsShopFilter()) {
    return true;
  }
  const fromId = issue.fromShop?.id;
  const toId = issue.toShop?.id;
  if (!fromId && !toId) {
    return true;
  }
  return hasShopAccess(fromId) || hasShopAccess(toId);
}

export function assignedShopIds(): number[] | null {
  const user = requireUser();
  if (skipsShopFilter(user)) {
    return null;
  }
  return user.shopIds;
}

export function shopScopeWhere(requestedShopId?: number): Record<string, any> {
  const user = requireUser();
  if (requestedShopId) {
    assertShopAccess(Number(requestedShopId));
    return { shop: { id: Number(requestedShopId) } };
  }
  if (skipsShopFilter(user)) {
    return {};
  }
  if (!user.shopIds.length) {
    return { shop: { id: In([-1]) } };
  }
  return { shop: { id: In(user.shopIds) } };
}

export function applyTenantScope(queryBuilder: { andWhere: Function }, alias: string): void {
  const scoped = tenantWhere();
  if (scoped.tenant) {
    queryBuilder.andWhere(`${alias}.tenant_id = :tenantId`, { tenantId: scoped.tenant.id });
  }
}

export function applyShopScope(queryBuilder: { andWhere: Function }, alias: string, shopId?: number): void {
  const user = requireUser();
  if (shopId) {
    assertShopAccess(Number(shopId));
    queryBuilder.andWhere(`${alias}.shop_id = :shopId`, { shopId: Number(shopId) });
    return;
  }
  if (skipsShopFilter(user)) {
    return;
  }
  const ids = user.shopIds.length ? user.shopIds : [-1];
  queryBuilder.andWhere(`${alias}.shop_id IN (:...shopIds)`, { shopIds: ids });
}

export function applyShopOrUnscoped(queryBuilder: { andWhere: Function }, alias: string, shopId?: number): void {
  const user = requireUser();
  if (shopId) {
    assertShopAccess(Number(shopId));
    queryBuilder.andWhere(`${alias}.shop_id = :shopId`, { shopId: Number(shopId) });
    return;
  }
  if (skipsShopFilter(user)) {
    return;
  }
  const ids = user.shopIds.length ? user.shopIds : [-1];
  queryBuilder.andWhere(`(${alias}.shop_id IN (:...shopIds) OR ${alias}.shop_id IS NULL)`, { shopIds: ids });
}

export function requireTenantId(): number {
  const tenantId = resolveTenantId();
  const user = requireUser();
  if (user.role === UserRole.SUPER_ADMIN && !tenantId) {
    throw new ForbiddenException('Select an organization before creating records');
  }
  if (!tenantId) {
    throw new ForbiddenException('Your account is not assigned to an organization');
  }
  return tenantId;
}

export function stampOwnership<T extends { tenant?: any; createdBy?: any }>(entity: T, tenantId?: number): T {
  const user = requireUser();
  entity.tenant = { id: tenantId || requireTenantId() } as any;
  entity.createdBy = { id: user.id } as any;
  return entity;
}
