import pg from 'pg';

let pool: pg.Pool | null = null;

/** Lazily creates the shared pool from `databaseUrl` (or process.env.DATABASE_URL). */
export function getPool(databaseUrl?: string): pg.Pool {
  if (!pool) {
    const url = databaseUrl ?? process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    pool = new pg.Pool({ connectionString: url, max: 5 });
    pool.on('error', (err) => console.error('pg pool error', err));
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params as unknown[]);
  return res.rows;
}

export async function withTransaction<R>(fn: (client: pg.PoolClient) => Promise<R>): Promise<R> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore rollback failure */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** For graceful shutdown; safe to call when the pool was never created. */
export async function closePool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}
