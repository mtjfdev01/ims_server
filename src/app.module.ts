import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ShopsModule } from './shops/shops.module';
import { StoresModule } from './stores/stores.module';
import { CompaniesModule } from './companies/companies.module';
import { ItemsModule } from './items/items.module';
import { SalesModule } from './sales/sales.module';
import { CustomersModule } from './customers/customers.module';
import { SellersModule } from './sellers/sellers.module';
import { ServiceJobsModule } from './service-jobs/service-jobs.module';
import { InstallmentsModule } from './installments/installments.module';
import { OrdersModule } from './orders/orders.module';
import { PurchasesModule } from './purchases/purchases.module';
import { ExpenseModule } from './expense/expense.module';
import { CategoryModule } from './category/category.module';
import { IssuesModule } from './issues/issues.module';
import { Shop } from './shops/entities/shop.entity';
import { Store } from './stores/entities/store.entity';
import { Category } from './category/entities/category.entity';
import { Company } from './companies/entities/company.entity';
import { Item } from './items/entities/item.entity';
import { Sale } from './sales/entities/sale.entity';
import { SaleItem } from './sale-items/entities/sale-item.entity';
import { Order } from './orders/entities/order.entity';
import { OrderItem } from './order-items/entities/order-item.entity';
import { Purchase } from './purchases/entities/purchase.entity';
import { Expense } from './expense/entities/expense.entity';
import { Issue } from './issues/entities/issue.entity';
import { User } from './users/entities/user.entity';
import { StockLot } from './stock-lots/entities/stock-lot.entity';
import { StockAllocation } from './stock-lots/entities/stock-allocation.entity';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StockLotsModule } from './stock-lots/stock-lots.module';
import { Tenant } from './tenants/entities/tenant.entity';
import { Customer } from './customers/entities/customer.entity';
import { Seller } from './sellers/entities/seller.entity';
import { SalePayment } from './sale-payments/entities/sale-payment.entity';
import { ServiceJob } from './service-jobs/entities/service-job.entity';
import { ServicePayment } from './service-payments/entities/service-payment.entity';
import { InstallmentPlan } from './installments/entities/installment-plan.entity';
import { InstallmentDue } from './installments/entities/installment-due.entity';
import { AuthAlsInterceptor } from './auth/auth-als.interceptor';
import { UserPermission } from './user-permissions/entities/user-permission.entity';
import { UserPermissionsModule } from './user-permissions/user-permissions.module';
import { RbacModule } from './rbac/rbac.module';
import { AuthGuard } from './rbac/guards/auth.guard';
import { RolesGuard } from './rbac/guards/roles.guard';
import { PermissionsGuard } from './rbac/guards/permissions.guard';

const ALL_ENTITIES = [
  Shop, Store, Category, Company, Item, Sale, SaleItem, Order, OrderItem,
  Purchase, Expense, Issue, User, StockLot, StockAllocation, Tenant,
  Customer, Seller, SalePayment, ServiceJob, ServicePayment, InstallmentPlan, InstallmentDue,
  UserPermission,
];

// Get database configuration
function getTypeOrmConfig() {
  let databaseUrl = process.env.DATABASE_URL;

  console.log('DATABASE_URL exists:', !!databaseUrl);
  console.log('DATABASE_URL starts with postgres:', databaseUrl?.startsWith('postgres'));

  // If DATABASE_URL is a full connection string, use it directly
  if (databaseUrl && (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://'))) {
    // Replace Railway internal domain with public domain for local development
    // Railway internal: postgres.railway.internal
    // Railway public: postgres-production-33ca.up.railway.app (from your dashboard)
    if (databaseUrl.includes('postgres.railway.internal')) {
      // Use public domain instead - update this to match your Railway public domain
      const publicDomain = process.env.RAILWAY_PUBLIC_HOST || 'postgres-production-33ca.up.railway.app';
      databaseUrl = databaseUrl.replace('postgres.railway.internal', publicDomain);
      console.log('Replaced Railway internal domain with public domain');
    }

    console.log('Using full DATABASE_URL connection string');
    return {
      type: 'postgres' as const,
      url: databaseUrl,
      entities: ALL_ENTITIES,
      synchronize: true, // Set to false in production
    };
  }

  // Otherwise, use individual configuration
  const config = {
    type: 'postgres' as const,
    host: process.env.DB_HOST || databaseUrl || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: (process.env.DB_PASSWORD || '').toString(),
    database: process.env.DB_DATABASE || 'ims',
    entities: ALL_ENTITIES,
    synchronize: true, // Set to false in production
  };

  console.log('Using individual config:', {
    host: config.host,
    port: config.port,
    username: config.username,
    database: config.database,
    hasPassword: !!config.password && config.password.length > 0,
  });

  return config;
}

@Module({
  imports: [
    TypeOrmModule.forRoot(getTypeOrmConfig()),
    ShopsModule,
    StoresModule,
    CompaniesModule,
    ItemsModule,
    SalesModule,
    CustomersModule,
    SellersModule,
    ServiceJobsModule,
    InstallmentsModule,
    OrdersModule,
    PurchasesModule,
    ExpenseModule,
    CategoryModule,
    IssuesModule,
    StockLotsModule,
    AuthModule,
    UsersModule,
    UserPermissionsModule,
    RbacModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuthAlsInterceptor },
  ],
})
export class AppModule {}
