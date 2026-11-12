import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { pool } from "@/lib/pg";
import { ASSETS_BUCKET, s3 } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Dev-only end-to-end check of every Neon service. Writes test data, so never exposed in production.
export async function GET() {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });

  const results: Record<string, unknown> = {};
  const run = async (name: string, fn: () => Promise<unknown>) => {
    try {
      results[name] = { ok: true, detail: await fn() };
    } catch (err) {
      results[name] = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  await run("postgres", async () => (await pool.query("SELECT current_database() AS db, now() AS at")).rows[0]);

  await run("objectStorage", async () => {
    const Key = `healthcheck/${crypto.randomUUID()}.txt`;
    const body = `hello ${Date.now()}`;
    await s3.send(new PutObjectCommand({ Bucket: ASSETS_BUCKET, Key, Body: body, ContentType: "text/plain" }));
    const got = await (await s3.send(new GetObjectCommand({ Bucket: ASSETS_BUCKET, Key }))).Body?.transformToString();
    await s3.send(new DeleteObjectCommand({ Bucket: ASSETS_BUCKET, Key }));
    if (got !== body) throw new Error(`read back "${got}"`);
    return { key: Key, roundTrip: "put/get/delete" };
  });

  // No realtime check: Neon Realtime rejects tables with RLS on, and every table here has RLS.

  const ok = Object.values(results).every((r) => (r as { ok: boolean }).ok);
  return Response.json({ ok, results }, { status: ok ? 200 : 500 });
}
