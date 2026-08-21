import { config } from 'dotenv';
config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { seedUsers } from './users/seed/users.seed';
import { backfillStockLots } from './stock-lots/backfill-lots';

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
  
  // Get allowed origins from environment or use defaults
  const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',') 
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://ims-client-eight.vercel.app',
      ];

  console.log('🌐 Allowed Origins:', allowedOrigins);

  app.enableCors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.log('Blocked by CORS:', origin); // Debug log
        callback(new Error('Not allowed by CORS'));
      }
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
      'Access-Control-Allow-Headers'
    ],
    exposedHeaders: [
      'Authorization',
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Credentials'
    ],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400 // 24 hours cache for preflight
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
    await backfillStockLots(dataSource);
    console.log('✅ FIFO stock lots ready');
  } catch (error) {
    console.error('❌ Error seeding users:', error);
  }

  const port = process.env.PORT || 3668;
  await app.listen(port);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`✅ Server started successfully on port ${port}`);
  console.log(`🌐 CORS enabled for origins: ${allowedOrigins.join(', ')}`);
  console.log(`📡 Server is ready to accept requests`);
  console.log('═══════════════════════════════════════════════════════');
}

bootstrap();