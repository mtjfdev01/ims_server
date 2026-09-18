import { config } from 'dotenv';
config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { seedUsers } from './users/seed/users.seed';
import { backfillStockLots } from './stock-lots/backfill-lots';
import { backfillTenants } from './tenants/backfill-tenants';

async function bootstrap() {
  console.log('🚀 Starting server...');
  
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  
  // Check database connection
  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    if (dataSource.isInitialized) {
      console.log('✅ Database connected successfully');
    } else {
      await dataSource.initialize();
      console.log('✅ Database connected successfully');
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
  
  const extraOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  const isAllowedOrigin = (origin?: string) => {
    if (!origin) return true;
    if (extraOrigins.includes(origin)) return true;
    try {
      const { hostname, protocol } = new URL(origin);
      const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
      const isVercel = hostname === 'ims-client-eight.vercel.app' || hostname.endsWith('.vercel.app');
      return (isLocal && (protocol === 'http:' || protocol === 'https:')) || isVercel;
    } catch {
      return false;
    }
  };

  app.enableCors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      console.log('Blocked by CORS:', origin);
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'X-Auth-Token',
      'X-Tenant-Id',
    ],
    optionsSuccessStatus: 204,
    maxAge: 86400,
  });

  // Global middleware to log incoming requests
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`📥 [${timestamp}] ${req.method} ${req.url} - Origin: ${req.headers.origin || 'N/A'}`);
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
  });

  // Run user seeder on startup
  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    console.log('🌱 Seeding users...');
    await seedUsers(dataSource);
    console.log('✅ Users seeded successfully');
    await backfillTenants(dataSource);
    console.log('✅ Tenant isolation ready');
    await backfillStockLots(dataSource);
    console.log('✅ FIFO stock lots ready');
  } catch (error) {
    console.error('❌ Error seeding users:', error);
  }

  const port = process.env.PORT || 3668;
  await app.listen(port);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`✅ Server started successfully on port ${port}`);
  console.log('🌐 CORS enabled for localhost, Vercel, and ALLOWED_ORIGINS');
  console.log(`📡 Server is ready to accept requests`);
  console.log('═══════════════════════════════════════════════════════');
}

bootstrap();