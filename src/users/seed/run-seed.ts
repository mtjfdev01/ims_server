import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { seedUsers } from './users.seed';
import { User } from '../entities/user.entity';

// Load environment variables
config();

function getDatabaseConfig() {
  let databaseUrl = process.env.DATABASE_URL;

  // If DATABASE_URL is a full connection string, use it directly
  if (databaseUrl && (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://'))) {
    return {
      type: 'postgres' as const,
      url: databaseUrl,
      entities: [User],
      synchronize: false,
    };
  }

  // Otherwise, use individual configuration
  return {
    type: 'postgres' as const,
    host: process.env.DB_HOST || databaseUrl || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: (process.env.DB_PASSWORD || '').toString(),
    database: process.env.DB_DATABASE || 'ims',
    entities: [User],
    synchronize: false,
  };
}

async function runSeed() {
  const dataSource = new DataSource(getDatabaseConfig());

  try {
    await dataSource.initialize();
    console.log('Database connected');

    await seedUsers(dataSource);

    await dataSource.destroy();
    console.log('Seed completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error running seed:', error);
    process.exit(1);
  }
}

runSeed();
