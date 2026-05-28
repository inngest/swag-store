import { Pool } from 'pg';

declare global {
  var __swagStorePgPool: Pool | undefined;
}

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  if (!globalThis.__swagStorePgPool) {
    globalThis.__swagStorePgPool = new Pool({
      connectionString,
      ssl: connectionString.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }

  return globalThis.__swagStorePgPool;
}
