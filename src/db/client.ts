import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is required. Set it in your .env file.');
  console.error('Example: DATABASE_URL=postgres://user:pass@localhost:5432/atlas');
  process.exit(1);
}

const sql = postgres(connectionString);
export const db = drizzle(sql, { schema });
export { sql };
