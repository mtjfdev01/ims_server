import { AsyncLocalStorage } from 'async_hooks';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  TENANT_ADMIN = 'tenant_admin',
  USER = 'user',
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  tenantId: number | null;
  shopIds: number[];
  viewTenantId?: number | null;
}

const storage = new AsyncLocalStorage<AuthUser>();

export type AuthedRequest = { authUser?: AuthUser };

export function attachAuthUser(req: object, user: AuthUser): void {
  (req as AuthedRequest).authUser = user;
}

export function runWithAuthUser<T>(user: AuthUser, callback: () => T): T {
  return storage.run(user, callback);
}

export function getAuthUser(req?: object): AuthUser | undefined {
  return (req as AuthedRequest | undefined)?.authUser || storage.getStore();
}
