import { UserRole } from '../common/request-context';
import { ALL_PERMISSIONS, Permission } from './permissions';

const TENANT_ADMIN_PERMISSIONS: Permission[] = [
  Permission.SHOPS_READ,
  Permission.SHOPS_WRITE,
  Permission.STORES_READ,
  Permission.STORES_WRITE,
  Permission.COMPANIES_READ,
  Permission.COMPANIES_WRITE,
  Permission.COMPANIES_DELETE,
  Permission.CATEGORIES_READ,
  Permission.CATEGORIES_WRITE,
  Permission.CATEGORIES_DELETE,
  Permission.ITEMS_READ,
  Permission.ITEMS_WRITE,
  Permission.ITEMS_DELETE,
  Permission.ITEMS_TRANSFER,
  Permission.SALES_READ,
  Permission.SALES_WRITE,
  Permission.SALES_DELETE,
  Permission.CUSTOMERS_READ,
  Permission.CUSTOMERS_WRITE,
  Permission.CUSTOMERS_DELETE,
  Permission.SELLERS_READ,
  Permission.SELLERS_WRITE,
  Permission.SELLERS_DELETE,
  Permission.SERVICES_READ,
  Permission.SERVICES_WRITE,
  Permission.SERVICES_DELETE,
  Permission.INSTALLMENTS_READ,
  Permission.INSTALLMENTS_WRITE,
  Permission.INSTALLMENTS_DELETE,
  Permission.ORDERS_READ,
  Permission.ORDERS_WRITE,
  Permission.ORDERS_DELETE,
  Permission.PURCHASES_READ,
  Permission.PURCHASES_WRITE,
  Permission.PURCHASES_DELETE,
  Permission.EXPENSES_READ,
  Permission.EXPENSES_WRITE,
  Permission.EXPENSES_DELETE,
  Permission.ISSUES_READ,
  Permission.ISSUES_WRITE,
  Permission.ISSUES_DELETE,
];

const USER_PERMISSIONS: Permission[] = [
  Permission.SHOPS_READ,
  Permission.STORES_READ,
  Permission.COMPANIES_READ,
  Permission.COMPANIES_WRITE,
  Permission.COMPANIES_DELETE,
  Permission.CATEGORIES_READ,
  Permission.CATEGORIES_WRITE,
  Permission.CATEGORIES_DELETE,
  Permission.ITEMS_READ,
  Permission.ITEMS_WRITE,
  Permission.ITEMS_DELETE,
  Permission.ITEMS_TRANSFER,
  Permission.SALES_READ,
  Permission.SALES_WRITE,
  Permission.SALES_DELETE,
  Permission.CUSTOMERS_READ,
  Permission.CUSTOMERS_WRITE,
  Permission.CUSTOMERS_DELETE,
  Permission.SELLERS_READ,
  Permission.SELLERS_WRITE,
  Permission.SELLERS_DELETE,
  Permission.SERVICES_READ,
  Permission.SERVICES_WRITE,
  Permission.SERVICES_DELETE,
  Permission.INSTALLMENTS_READ,
  Permission.INSTALLMENTS_WRITE,
  Permission.INSTALLMENTS_DELETE,
  Permission.ORDERS_READ,
  Permission.ORDERS_WRITE,
  Permission.ORDERS_DELETE,
  Permission.PURCHASES_READ,
  Permission.PURCHASES_WRITE,
  Permission.PURCHASES_DELETE,
  Permission.EXPENSES_READ,
  Permission.EXPENSES_WRITE,
  Permission.EXPENSES_DELETE,
  Permission.ISSUES_READ,
  Permission.ISSUES_WRITE,
  Permission.ISSUES_DELETE,
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: ALL_PERMISSIONS,
  [UserRole.TENANT_ADMIN]: TENANT_ADMIN_PERMISSIONS,
  [UserRole.USER]: USER_PERMISSIONS,
};

export function permissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  if (role === UserRole.SUPER_ADMIN) {
    return true;
  }
  return permissionsForRole(role).includes(permission);
}

export const ASSIGNABLE_ROLES = [UserRole.TENANT_ADMIN, UserRole.USER];
