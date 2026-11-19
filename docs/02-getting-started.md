# 02 — Getting started

## Prerequisites

| Requirement | Why |
| ----------- | --- |
| Node.js **≥ 20.12** (or any version with `process.loadEnvFile`) | `scripts/migrate.mjs` calls `process.loadEnvFile?.(".env.local")`. On older Node the call is skipped, so the environment variables must already be exported. Next.js 16 itself also requires a modern Node LTS. |
| npm | `package-lock.json` is committed; the scripts use npm (`next`, `eslint`). |
| A Neon project with the CLI (`neon`) | Provisions Postgres, the `assets` bucket, and writes credentials to `.env.local`. |
| Network access to the Neon endpoint | All reads and writes are remote. |

## 1. Install dependencies

```bash
npm install
```

## 2. Provision Neon services

Services, buckets, and branch policy are declared in `neon.ts`:

```ts
export default defineConfig({
  preview: { realtime: true },
  auth: false,
  buckets: { assets: { access: "private" } },
  branch: (branch) => {
    if (branch.isDefault) return {};
    if (!branch.exists) return { ttl: "7d" };
    return {};
  },
});
```

`neon deploy` provisions them and writes the environment variables to `.env.local`.
If the repo is already linked, `neon env pull` refreshes `.env.local` after any change to
the Neon configuration (for example, after rotating keys or adding a bucket).

`.env.local` is git-ignored (`.gitignore` contains `.env*`), as is the local `.neon`
directory. Never commit either.

## 3. Environment variables

`neon env pull` writes these names. Values are secrets and are intentionally not documented
here.

| Variable | Used by | Purpose |
| -------- | ------- | ------- |
| `DATABASE_URL` | `lib/pg.ts` | **Pooled** connection string for all app traffic. |
| `DATABASE_URL_UNPOOLED` | `scripts/migrate.mjs` | **Direct** connection used only for DDL/migrations. |
| `NEON_BRANCH` | Neon tooling | Branch name. Not read by app code. |
| `NEON_BRANCH_ID` | Neon tooling | Branch identifier. Not read by app code. |
| `NEON_FUNCTION_HOST_SUFFIX` | Neon tooling | Function host suffix. Not read by app code. |
| `NEON_REALTIME_URL` | Neon tooling | Realtime endpoint. Not read by app code (realtime is unused). |
| `NEON_REALTIME_SECRET` | Neon tooling | Realtime secret. Not read by app code. |
| `AWS_ACCESS_KEY_ID` | `@aws-sdk/client-s3` (implicit) | Object Storage credentials. |
| `AWS_SECRET_ACCESS_KEY` | `@aws-sdk/client-s3` (implicit) | Object Storage credentials. |
| `AWS_ENDPOINT_URL_S3` | `@aws-sdk/client-s3` (implicit) | Points the S3 client at Neon. |
| `AWS_REGION` | `@aws-sdk/client-s3` (implicit) | Required by the SDK. |

`lib/storage.ts` creates the S3 client with **no explicit credentials or endpoint**:

```ts
export const s3 = new S3Client({ forcePathStyle: true }); // Neon requires path-style
export const ASSETS_BUCKET = "assets";
```

The AWS SDK v3 reads `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`,
and `AWS_REGION` from the environment automatically. `forcePathStyle: true` is mandatory —
Neon's S3 endpoint does not support virtual-hosted-style bucket URLs.

## 4. Apply the schema

```bash
npm run db:migrate
```

This runs `scripts/migrate.mjs`, which:

1. loads `.env.local` (when Node supports `process.loadEnvFile`),
2. reads `DATABASE_URL_UNPOOLED` and fails fast with
   `DATABASE_URL_UNPOOLED missing; run \`neon env pull\`` if absent,
3. executes the whole of `db/schema.sql` as one query,
4. prints the resulting `public` table names.

`db/schema.sql` is **idempotent** — `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT
EXISTS`, `CREATE OR REPLACE VIEW`, and seed inserts guarded by `WHERE NOT EXISTS`. Re-running
it never overwrites admin edits and never undoes a department's open/closed state.

Expected output on a fresh database:

```text
tables: applications, department_answers, department_questions, department_roles, departments, registration_personal_info
```

(`application_answers` is a view, so it is not listed by the query.)

## 5. Run the dev server

```bash
npm run dev
```

Open <http://localhost:3000>.

Two things happen automatically that are worth knowing:

- `next dev` regenerates `AGENTS.md` with the `nextjs-agent-rules` block. Do not delete that
  block; it will be re-added and leave the tree dirty.
- `lib/pg.ts` rebuilds its pool when `DATABASE_URL` changes, so `neon env pull` while the dev
  server is running is safe.

## 6. Verify the backend

With the dev server running:

```bash
curl http://localhost:3000/api/neon-health
```

Healthy response (`200`):

```json
{
  "ok": true,
  "results": {
    "postgres": { "ok": true, "detail": { "db": "neondb", "at": "..." } },
    "objectStorage": { "ok": true, "detail": { "key": "healthcheck/<uuid>.txt", "roundTrip": "put/get/delete" } }
  }
}
```

Any failure returns `500` with `ok: false` and an `error` string per failing service.
The route returns `404` when `NODE_ENV === "production"` — it writes test objects, so it must
never be publicly reachable.

## 7. Lint and build

```bash
npm run lint
npm run build
```

`npm run build` prerenders `/register/<slug>/submit` for all eight slugs
(`generateStaticParams` + `dynamicParams = false`). The four registration pages are dynamic
and are rendered on demand.

## Troubleshooting local setup

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| `DATABASE_URL_UNPOOLED missing` | `.env.local` absent/stale, or Node too old to auto-load it | `neon env pull`, or export the variable yourself |
| Pages render but every submit fails | `DATABASE_URL` points at a paused/deleted branch | Check the Neon console, then `neon env pull` and restart |
| `relation "departments" does not exist` | Schema never applied to this branch | `npm run db:migrate` |
| Department dropdown is empty of open departments | Every department is `closed = true` | Update `departments.closed` in the Neon console |
| Health route 404s | You are running a production build | Expected; use `npm run dev` |
| Object Storage health step fails | Missing/expired `AWS_*` vars, or bucket not provisioned | `neon deploy` / `neon env pull` |

## Related docs

- [Operations](./10-operations.md) — deploying and maintaining a live instance
- [Data model](./06-data-model.md) — what the migration creates
