function getDatabaseConfig() {
  const databaseUrl = process.env.DATABASE_URL;

  // If DATABASE_URL is a full connection string (postgresql:// or postgres://)
  if (databaseUrl && (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://'))) {
    try {
      const url = new URL(databaseUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        username: url.username || 'postgres',
        password: url.password || '',
        database: url.pathname.slice(1) || 'ims', // Remove leading '/'
      };
    } catch (error) {
      console.error('Error parsing DATABASE_URL:', error);
    }
  }

  // If DATABASE_URL is just a host, use it with other env vars
  if (databaseUrl && !databaseUrl.includes('://')) {
    const config = {
      host: databaseUrl,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
      username: process.env.DB_USERNAME || 'postgres',
      password: (process.env.DB_PASSWORD || '').toString(), // Ensure string
      database: process.env.DB_DATABASE || 'ims',
    };
    return config;
  }

  // Fall back to individual environment variables
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: (process.env.DB_PASSWORD || '').toString(), // Ensure string
    database: process.env.DB_DATABASE || 'ims',
  };
}

export const databaseConfig = getDatabaseConfig();

// Log database config for debugging (without password)
console.log('Database Config:', {
  host: databaseConfig.host,
  port: databaseConfig.port,
  username: databaseConfig.username,
  database: databaseConfig.database,
  hasPassword: !!databaseConfig.password,
});
