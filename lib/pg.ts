import "server-only";
import { Pool } from "pg";

// Pooled DATABASE_URL for app traffic. One pool per server process.
// shortcut: on Vercel, wrap with attachDatabasePool from @vercel/functions so idle clients close before suspend.
const globalForPg = globalThis as unknown as { pgPool?: Pool; pgUrl?: string };
const url = process.env.DATABASE_URL;
// Reuse across HMR, but rebuild when DATABASE_URL changes (e.g. `neon env pull` while `next dev` runs).
if (!globalForPg.pgPool || globalForPg.pgUrl !== url) {
  void globalForPg.pgPool?.end().catch(() => {});
  globalForPg.pgPool = new Pool({ connectionString: url });
  globalForPg.pgUrl = url;
}
export const pool = globalForPg.pgPool;
