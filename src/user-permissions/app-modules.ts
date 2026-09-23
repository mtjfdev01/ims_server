import { UserRole } from '../common/request-context';

export type AppModuleKey =
  | 'dashboard'
  | 'sales'
  | 'services'
  | 'installments'
  | 'customers'
  | 'items'
  | 'issues'
  | 'categories'
  | 'companies'
  | 'purchases'
  | 'expenses'
  | 'shops'
  | 'stores'
  | 'users';

export const APP_MODULES: { key: AppModuleKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'sales', label: 'Sales' },
  { key: 'services', label: 'Services' },
  { key: 'installments', label: 'Installments' },
  { key: 'customers', label: 'Customers' },
  { key: 'items', label: 'Items' },
  { key: 'issues', label: 'Stock Transfers' },
  { key: 'categories', label: 'Categories' },
  { key: 'companies', label: 'Companies' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'shops', label: 'Shops' },
  { key: 'stores', label: 'Stores' },
  { key: 'users', label: 'Users & permissions' },
];

export const APP_MODULE_KEYS = APP_MODULES.map(module => module.key);

const STAFF_MODULES: AppModuleKey[] = APP_MODULE_KEYS.filter(key => key !== 'users');

export function defaultModulesForRole(role: UserRole): AppModuleKey[] {
  if (role === UserRole.SUPER_ADMIN || role === UserRole.TENANT_ADMIN) {
    return [...APP_MODULE_KEYS];
  }
  return [...STAFF_MODULES];
}

export function isAppModule(value: string): value is AppModuleKey {
  return (APP_MODULE_KEYS as string[]).includes(value);
}

/** Existing users were seeded before Stock Transfers existed; keep access if they already have Items. */
export function withStockTransfersModule(modules: string[]): string[] {
  const unique = [...new Set((modules || []).map(value => (
    value === 'stock_transfers' ? 'issues' : value
  )).filter(Boolean))];
  if (!unique.includes('issues') && unique.includes('items')) {
    unique.splice(unique.indexOf('items') + 1, 0, 'issues');
  }
  return unique;
}

