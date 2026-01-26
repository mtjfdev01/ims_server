// Load environment variables from .env file FIRST, before any other imports
import { config } from 'dotenv';
config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { seedUsers } from './users/seed/users.seed';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      'http://localhost:3001',
      'https://ims-client-eight.vercel.app',
      'https://ims-client-eight.vercel.app/'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204
  });
  
  // Run user seeder on startup
  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    await seedUsers(dataSource);
  } catch (error) {
    console.error('Error seeding users:', error);
  }
  
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
