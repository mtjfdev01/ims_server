import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant } from './entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { Shop } from '../shops/entities/shop.entity';
import { Store } from '../stores/entities/store.entity';
import { Company } from '../companies/entities/company.entity';
import { Category } from '../category/entities/category.entity';
import { Item } from '../items/entities/item.entity';
import { Sale } from '../sales/entities/sale.entity';
import { Order } from '../orders/entities/order.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { Expense } from '../expense/entities/expense.entity';
import { Issue } from '../issues/entities/issue.entity';
import { UserRole } from '../common/request-context';

export async function backfillTenants(dataSource: DataSource): Promise<void> {
  const tenantRepo = dataSource.getRepository(Tenant);
  const userRepo = dataSource.getRepository(User);

  const superEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@example.com';
  const superPassword = process.env.SUPER_ADMIN_PASSWORD || 'admin123';

  let superAdmin = await userRepo.findOne({ where: { email: superEmail } });
  if (!superAdmin) {
    superAdmin = userRepo.create({
      email: superEmail,
      name: 'Super Admin',
      password: await bcrypt.hash(superPassword, 10),
      visiblePassword: superPassword,
      role: UserRole.SUPER_ADMIN,
    });
    await userRepo.save(superAdmin);
    console.log(`Created super admin ${superEmail}`);
  } else if (superAdmin.role !== UserRole.SUPER_ADMIN) {
    superAdmin.role = UserRole.SUPER_ADMIN;
    superAdmin.tenant = null;
    await userRepo.save(superAdmin);
    console.log(`Promoted ${superEmail} to super admin`);
  }

  let defaultTenant = await tenantRepo.findOne({ where: { name: 'Default Organization' } });
  if (!defaultTenant) {
    defaultTenant = await tenantRepo.save(tenantRepo.create({
      name: 'Default Organization',
      billingActive: true,
    }));
  }

  const regularUsers = await userRepo.find({ relations: ['tenant'] });
  for (const user of regularUsers) {
    if (user.role === UserRole.SUPER_ADMIN) {
      if (user.tenant) {
        user.tenant = null;
        await userRepo.save(user);
      }
      continue;
    }
    if (!user.tenant) {
      user.tenant = defaultTenant;
      user.role = UserRole.USER;
      await userRepo.save(user);
    }
  }

  const assignTenant = async (repo: any, alias: string) => {
    const rows = await repo.createQueryBuilder(alias)
      .where(`${alias}.tenant_id IS NULL`)
      .getMany();
    for (const row of rows) {
      row.tenant = defaultTenant;
      await repo.save(row);
    }
    return rows.length;
  };

  const counts = {
    shops: await assignTenant(dataSource.getRepository(Shop), 'shop'),
    stores: await assignTenant(dataSource.getRepository(Store), 'store'),
    companies: await assignTenant(dataSource.getRepository(Company), 'company'),
    categories: await assignTenant(dataSource.getRepository(Category), 'category'),
    items: await assignTenant(dataSource.getRepository(Item), 'item'),
    sales: await assignTenant(dataSource.getRepository(Sale), 'sale'),
    orders: await assignTenant(dataSource.getRepository(Order), 'order'),
    purchases: await assignTenant(dataSource.getRepository(Purchase), 'purchase'),
    expenses: await assignTenant(dataSource.getRepository(Expense), 'expense'),
    issues: await assignTenant(dataSource.getRepository(Issue), 'issue'),
  };

  console.log('Tenant backfill complete', counts);
}
