import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index';

const { Pool } = pg;

export type Database = NodePgDatabase<typeof schema>;

let globalPool: pg.Pool | undefined;
let globalDb: Database | undefined;

export function getDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    'postgresql://copilot:copilot_local_password@localhost:5432/job_copilot'
  );
}

export function getPool(): pg.Pool {
  if (!globalPool) {
    globalPool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 10,
    });
  }
  return globalPool;
}

export function getDb(): Database {
  if (!globalDb) {
    globalDb = drizzle(getPool(), { schema });
  }
  return globalDb;
}

export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export async function closeDb(): Promise<void> {
  if (globalPool) {
    await globalPool.end();
    globalPool = undefined;
    globalDb = undefined;
  }
}
