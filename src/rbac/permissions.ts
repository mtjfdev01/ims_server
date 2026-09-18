export enum Permission {
  USERS_MANAGE = 'users.manage',
  USERS_PASSWORD = 'users.password',
  TENANTS_READ = 'tenants.read',
  BULK_DELETE = 'bulk.delete',

  SHOPS_READ = 'shops.read',
  SHOPS_WRITE = 'shops.write',
  SHOPS_DELETE = 'shops.delete',

  STORES_READ = 'stores.read',
  STORES_WRITE = 'stores.write',
  STORES_DELETE = 'stores.delete',

  COMPANIES_READ = 'companies.read',
  COMPANIES_WRITE = 'companies.write',
  COMPANIES_DELETE = 'companies.delete',

  CATEGORIES_READ = 'categories.read',
  CATEGORIES_WRITE = 'categories.write',
  CATEGORIES_DELETE = 'categories.delete',

  ITEMS_READ = 'items.read',
  ITEMS_WRITE = 'items.write',
  ITEMS_DELETE = 'items.delete',
  ITEMS_TRANSFER = 'items.transfer',

  SALES_READ = 'sales.read',
  SALES_WRITE = 'sales.write',
  SALES_DELETE = 'sales.delete',

  ORDERS_READ = 'orders.read',
  ORDERS_WRITE = 'orders.write',
  ORDERS_DELETE = 'orders.delete',

  PURCHASES_READ = 'purchases.read',
  PURCHASES_WRITE = 'purchases.write',
  PURCHASES_DELETE = 'purchases.delete',

  EXPENSES_READ = 'expenses.read',
  EXPENSES_WRITE = 'expenses.write',
  EXPENSES_DELETE = 'expenses.delete',

  ISSUES_READ = 'issues.read',
  ISSUES_WRITE = 'issues.write',
  ISSUES_DELETE = 'issues.delete',
}

export const ALL_PERMISSIONS = Object.values(Permission);
