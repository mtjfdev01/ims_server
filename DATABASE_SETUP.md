# Database Setup Guide

## Prerequisites
- PostgreSQL database named `ims` in your Railways Postgres server
- Database connection details (host, port, username, password)

## Installation

1. Install the required packages:
```bash
cd server
npm install
```

This will install:
- `@nestjs/typeorm` - NestJS TypeORM integration
- `typeorm` - TypeORM ORM
- `pg` - PostgreSQL driver

## Configuration

1. Create a `.env` file in the `server` directory with your database credentials:

```env
DB_HOST=your_railways_host
DB_PORT=5432
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_DATABASE=ims

PORT=3000
```

**For Railways Postgres:**
- The host is usually something like: `monorail.proxy.rlwy.net` or similar
- Port is typically `5432`
- Get your credentials from your Railways dashboard

2. The application will automatically:
   - Connect to the database on startup
   - Create all tables automatically (synchronize: true)
   - Set up all relationships

## Running the Application

1. Start the server:
```bash
npm run start:dev
```

2. The server will:
   - Connect to PostgreSQL
   - Create all necessary tables
   - Be ready to accept API requests

## Database Tables

The following tables will be automatically created:
- `shops` - Shop information
- `stores` - Store information
- `categories` - Category information
- `companies` - Company information
- `items` - Item information
- `sales` - Sales records
- `expenses` - Expense records

## Important Notes

- `synchronize: true` is enabled for development. **Set this to `false` in production** and use migrations instead.
- All data will persist in PostgreSQL
- The database connection is configured in `src/app.module.ts`

## Troubleshooting

If you encounter connection errors:
1. Verify your database credentials in `.env`
2. Ensure your database is accessible from your network
3. Check that the database `ims` exists
4. Verify firewall/network settings allow connections

