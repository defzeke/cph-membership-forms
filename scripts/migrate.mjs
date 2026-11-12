// Applies db/schema.sql over the direct (unpooled) connection, per Neon guidance for migrations.
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile?.(".env.local");
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("DATABASE_URL_UNPOOLED missing; run `neon env pull`");

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  const { rows } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1",
  );
  console.log("tables:", rows.map((r) => r.table_name).join(", "));
} finally {
  await client.end();
}
