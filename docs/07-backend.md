# 07 — Backend

Everything server-side lives in five small modules. There is no service layer, no repository
pattern, and no ORM: `pg` queries are written inline and results are typed with generics.

| Module | Exports | Used by |
| ------ | ------- | ------- |
| `lib/pg.ts` | `pool` | `lib/db.ts`, `lib/questions.ts`, health route |
| `lib/db.ts` | `submitApplication` (server action) | `app/register/[department]/department-form.tsx` |
| `lib/questions.ts` | `getClosedSlugs`, `getRolesAndQuestions`, `Question` | the two dynamic register pages |
| `lib/storage.ts` | `s3`, `ASSETS_BUCKET` | health route |
| `lib/proxy.ts` | `registrationGuard` | `proxy.ts` |

## `submitApplication` — the only write path

**File:** `lib/db.ts` (module-level `"use server"`, so every export is a server action)

```ts
export async function submitApplication(
  slug: string,
  role: string,
  answers: Record<string, string>, // question id -> answer
  interviewAt: string | null, // ISO start of the picked slot, from getOpenSlots
  team: string | null, // one of the role's teams, when it has any
): Promise<{ error: string | null }>
```

It returns a result object and never throws to the client. `{ error: null }` means committed.

### Validation gates, in order

The ordering matters: cheap checks happen before a database transaction is opened, and the
expensive/current-state checks happen inside it.

| # | Gate | Failure message |
| - | ---- | --------------- |
| 1 | `getDepartment(slug)` finds a slug in `DEPARTMENTS` | `This department is not accepting applications.` |
| 2 | `role` is a string and `answers` is a non-null object | `Invalid submission.` |
| 3 | Cookies exist, pass `registerSchema.safeParse`, and every cookie value ≤ **2000** chars | `Missing or invalid personal information. Please check the Personal Information page.` |
| 4 | Inside `BEGIN`: `department_roles` row exists for `(slug, role)` | `Please select a position before submitting.` |
| 5 | That row's department is not `closed` | `This department is not accepting applications.` |
| 6 | `Object.keys(answers).length === active question count` and every active id is present as a string | `The questions were just updated. Please reload the page and answer them again.` |
| 7 | Every answer is non-blank after trim and ≤ **5000** chars | `Please answer every question (up to 5000 characters each).` |
| 8 | Inserts succeed, including the unique email index | `This email has already been used to apply. Each email can only apply once.` / `Could not save your submission. Please try again.` |

Gate 6 is stricter than it looks: it rejects **extra** answer keys as well as missing ones,
so a client cannot sneak in answers for questions it should not have.

### Cookie re-validation

```ts
const jar = await cookies();
const raw = Object.fromEntries(
  registerFieldNames.map((f) => [f, jar.get(COOKIE_PREFIX + f)?.value ?? ""]),
);
const parsed = registerSchema.safeParse(raw);
if (!parsed.success || Object.values(raw).some((v) => v.length > 2000)) {
  return { error: "Missing or invalid personal information. …" };
}
const info = toPersonalInfoRecord(parsed.data);
```

This is the trust boundary. The client-side form already validated, but cookies are
browser-controlled, so the same Zod schema runs again server-side and an additional size cap
rejects oversized payloads before they reach SQL.

`toPersonalInfoRecord` drops two fields from the submitted values:

- `membershipType` — used only to route to a department, never stored.
- nothing else; `linkedinLink: ""` becomes `null`.

### The transaction

```ts
const client = await pool.connect();
const fail = async (error: string) => {
  await client.query("ROLLBACK");
  return { error };
};

try {
  await client.query("BEGIN");

  const { rows: [roleRow] } = await client.query(
    `SELECT r.id, d.closed
       FROM department_roles r
       JOIN departments d ON d.id = r.department_id
      WHERE d.slug = $1 AND r.name = $2`,
    [department.slug, role],
  );
  if (!roleRow) return await fail("Please select a position before submitting.");
  if (roleRow.closed) return await fail("This department is not accepting applications.");

  const { rows: questions } = await client.query(
    "SELECT id::text AS id FROM department_questions WHERE role_id = $1 AND active",
    [roleRow.id],
  );
  // …answer key/size checks…

  const cols = Object.keys(info) as (keyof typeof info)[];
  const { rows: [user] } = await client.query(
    `INSERT INTO registration_personal_info (${cols.join(", ")})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
    cols.map((c) => info[c]),
  );

  const { rows: [application] } = await client.query(
    "INSERT INTO applications (user_id, role_id, interview_at, team) VALUES ($1, $2, $3, $4) RETURNING id",
    [user.id, roleRow.id],
  );

  await client.query(
    `INSERT INTO department_answers (application_id, role_id, question_id, answer)
     SELECT $1, $2, unnest($3::bigint[]), unnest($4::text[])`,
    [application.id, roleRow.id, ids, values],
  );

  await client.query("COMMIT");
  return { error: null };
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  // …
} finally {
  client.release();
}
```

Notes on the implementation:

- **All-or-nothing.** Personal info, application, and answers share one transaction. A failing
  answer insert does not leave an orphan applicant.
- **`client` from the pool, not `pool.query`.** A transaction needs one connection; using
  `pool.query` for `BEGIN` would spread statements across connections.
- **Bulk answer insert.** `unnest($3::bigint[], $4::text[])` writes N answers in one statement.
  The `ids` array comes from the database as text (`id::text`) and is cast back to `bigint[]`.
- **Column list is derived from `toPersonalInfoRecord`'s keys**, which are fixed. No user input
  ever becomes an identifier; values are parameterised.
- **`finally` always releases** the client, including after early `fail()` returns.

### Error translation

```ts
catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  if ((err as { constraint?: string }).constraint === "registration_personal_info_email_key") {
    return { error: "This email has already been used to apply. Each email can only apply once." };
  }
  console.error(`[submitApplication] ${department.slug}`, err);
  return { error: "Could not save your submission. Please try again." };
}
```

`pg` puts the violating constraint name on `err.constraint`, which is why the SQL index name
matters: renaming `registration_personal_info_email_key` silently breaks this friendly message.

There is no retry logic, no rate limiting, no idempotency key, and no error-reporting service —
unexpected failures exist only in server logs.

## Reads — `lib/questions.ts`

```ts
export async function getClosedSlugs(): Promise<string[]> {
  const { rows } = await pool.query<{ slug: string }>("SELECT slug FROM departments WHERE closed");
  return rows.map((r) => r.slug);
}
```

```ts
export type Question = { id: string; role: string; prompt: string };

export async function getRolesAndQuestions(
  slug: string,
): Promise<{ roles: Role[]; questions: Question[] }> {
  const { rows } = await pool.query<{ role: string; category: string; teams: string[] | null; id: string | null; prompt: string | null }>(
    `SELECT r.name AS role, r.category, r.teams, q.id::text AS id, q.prompt
       FROM department_roles r
       JOIN departments d ON d.id = r.department_id
       LEFT JOIN department_questions q ON q.role_id = r.id AND q.active
      WHERE d.slug = $1 AND r.category IS NOT NULL
      ORDER BY r.position, r.id, q.position, q.id`,
    [slug],
  );
  return {
    roles: [...new Map(rows.map((r) => [r.role, { name: r.role, category: r.category, teams: r.teams }])).values()],
    questions: rows.filter((r) => r.id !== null).map((r) => ({ id: r.id!, role: r.role, prompt: r.prompt! })),
  };
}
```

Design points:

- **`category IS NOT NULL`** hides retired roles. The submit path checks the same thing.
- **`LEFT JOIN` on questions** so a role with no active questions (General Member) still lists.

`getOpenSlots(slug)` runs `OPEN_SLOTS_SQL`: every future 20-minute start inside the
department's `interview_windows` that no application in the department has booked. The submit
path runs the same SQL inside its transaction after `SELECT ... FROM departments ... FOR UPDATE`,
so two applicants can't book one slot. It accepts `interviewAt` only if it is in that list,
and accepts `null` only when the list is empty. Role `Member` skips this check.

`team` must be one of `department_roles.teams` when the role has any, and `null` otherwise
("Please pick a team."). The slot check only runs when `department_roles.interview` is true.

Other server actions in `lib/db.ts`:

- `listOpenSlots(slug)` — public; the slot pickers poll it.
- `getBooking()` — reads the `cph_application` cookie set on submit; returns the booking and
  open slots, or `null` when there is no cookie, the token doesn't match, or 5 hours have passed.
- `rescheduleInterview(slot)` — same checks plus `lockOpenSlots`, then updates `interview_at`.
- **`id::text`** because the client uses ids as HTML `name`/React keys; text avoids any
  bigint serialisation ambiguity.
- **Ordering is done in SQL** (`r.position, r.id, q.position, q.id`), so the UI order is
  controlled by admin edits, not by JavaScript.
- **One query per page**, no N+1, no caching. Both queries are parameterised.

The function names say "questions" but it resolves roles too. `Question.role` is the role
**name**, which is what the client filters on.

## Connection pool — `lib/pg.ts`

```ts
import "server-only";
import { Pool } from "pg";

const globalForPg = globalThis as unknown as { pgPool?: Pool; pgUrl?: string };
const url = process.env.DATABASE_URL;

if (!globalForPg.pgPool || globalForPg.pgUrl !== url) {
  void globalForPg.pgPool?.end().catch(() => {});
  globalForPg.pgPool = new Pool({ connectionString: url });
  globalForPg.pgUrl = url;
}

export const pool = globalForPg.pgPool;
```

- `server-only` makes a client import a build error.
- `globalThis` caching survives Next.js dev HMR; without it every file save leaks a pool.
- Comparing `pgUrl` means a changed `DATABASE_URL` (for example after `neon env pull`) swaps
  pools instead of silently using stale credentials.
- No `max`, `idleTimeoutMillis`, or SSL options are set — `pg` defaults apply, and the pooled
  Neon URL already terminates TLS.
- `url` may be `undefined` during a bad build; the pool is then created with no connection
  string and fails at first query rather than at import.

## Object Storage — `lib/storage.ts`

```ts
import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

export const s3 = new S3Client({ forcePathStyle: true });
export const ASSETS_BUCKET = "assets";
```

- Credentials, region, and endpoint come from `AWS_*` environment variables written by
  `neon env pull` (see [Getting started](./02-getting-started.md#3-environment-variables)).
- `forcePathStyle: true` is required by Neon's S3-compatible endpoint.
- The bucket is declared in `neon.ts` as `{ access: "private" }`.
- Only the health route uses this client. **Applicants never upload files** — the form takes a
  Google Drive URL for the ID, so there are no presigned URLs, no upload endpoints, and no
  object lifecycle rules in this repo.

## Health route — `GET /api/neon-health`

```ts
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  // …
}
```

Checks performed:

1. **Postgres** — `SELECT current_database() AS db, now() AS at`.
2. **Object Storage** — `PutObjectCommand` → `GetObjectCommand` → `DeleteObjectCommand` on
   `healthcheck/<uuid>.txt`, then compares the read-back body to what was written.

Response shape:

```json
{
  "ok": true,
  "results": {
    "postgres":       { "ok": true, "detail": { "db": "neondb", "at": "2026-11-18T…" } },
    "objectStorage":  { "ok": true, "detail": { "key": "healthcheck/…txt", "roundTrip": "put/get/delete" } }
  }
}
```

- Status `200` when every check passed, `500` otherwise.
- Each check is wrapped so one failure does not abort the rest.
- Realtime is intentionally **not** checked: Neon Realtime rejects tables with RLS, and every
  table in this schema has RLS.

## Backend invariants

If you change backend code, keep these true:

1. `submitApplication` is still the only function that writes to the database.
2. All SQL uses parameters; no string interpolation of user values.
3. Personal info is re-validated server-side on every submit.
4. The answer set is compared against the **live active** question set inside the transaction.
5. Reads stay uncached (`force-dynamic` on the pages that use them) so admin edits are live.
6. `pool` is still a singleton on `globalThis` so hot reload does not leak connections.
