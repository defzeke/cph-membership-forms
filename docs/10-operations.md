# 10 — Operations

A runbook for the person maintaining a live form. It assumes you have Neon console access and
the `neon` CLI configured for the project.

## Environments

| Environment | Database | How it runs |
| ----------- | -------- | ----------- |
| Local | A Neon branch (often the default) | `npm run dev`, env from `.env.local` |
| Production | The default branch | `npm run build` + `npm start` on a Node host, env from the host's secret store |

There is no staging configuration in the repo. If you want one, use a Neon branch: `neon.ts`
gives every new non-default branch a 7-day TTL, so a throwaway branch is the intended pattern.

```ts
branch: (branch) => {
  if (branch.isDefault) return {};        // project defaults
  if (!branch.exists) return { ttl: "7d" }; // new branches auto-expire
  return {};                              // existing branches untouched
}
```

Create one with `neon checkout <name>`, point `DATABASE_URL` at it, and it disappears on its
own after a week.

## First deploy

1. Provision services: `neon deploy` (declares the `assets` bucket, realtime preview, branch
   policy). This also writes `.env.local` locally.
2. Make the same variables available to the host. **`.env.local` is git-ignored and is not
   read in production.** Required names are listed in
   [Getting started](./02-getting-started.md#3-environment-variables).
3. Apply the schema against the production branch:
   ```bash
   npm run db:migrate
   ```
   This needs `DATABASE_URL_UNPOOLED` to point at production. Confirm the printed table list.
4. Build and start:
   ```bash
   npm ci
   npm run build
   npm start
   ```
5. Verify by hand, in this order:
   - `GET /` renders the consent screen.
   - `GET /register` renders with a department list.
   - Complete one real application end to end.
   - Query `application_answers` and confirm the row exists.
   - Re-submit with the same email and confirm the friendly duplicate error.

`GET /api/neon-health` is **404 in production by design** — do not use it as a post-deploy
check there.

## Routine operations

### Open or close a department

```sql
UPDATE departments SET closed = true  WHERE slug = 'technology-department';
UPDATE departments SET closed = false WHERE slug = 'technology-department';
```

No deploy needed. Effects on the next request:

- the option is disabled and labelled "(closed)" on `/register`;
- `/register/<slug>` redirects to `/register`;
- in-flight submissions are rejected with "This department is not accepting applications."

### Add or edit a role

```sql
INSERT INTO department_roles (department_id, position, name)
SELECT id, 3, 'Committee Head' FROM departments WHERE slug = 'technology-department';
```

Role names are matched exactly by the submit action, so avoid renaming a role while
applications are open.

### Change a question

Never edit a live prompt in place if answers already exist. Retire and replace:

```sql
UPDATE department_questions SET active = false WHERE id = 42;
INSERT INTO department_questions (role_id, position, prompt)
SELECT role_id, position, 'New prompt?' FROM department_questions WHERE id = 42;
```

Applicants with the page open get "The questions were just updated. Please reload the page and
answer them again."

### Reorder questions or roles

```sql
UPDATE department_questions SET position = 1 WHERE id = 43;
UPDATE department_questions SET position = 2 WHERE id = 44;
```

Ordering is `position, id`, so ties are stable.

### Read applications

```sql
-- everything, one row per answer
SELECT created_at, application_id, first_name, last_name, email,
       department, role, status, question, answer
FROM application_answers
ORDER BY created_at DESC, application_id, question_id;
```

```sql
-- applications that answered nothing (absent from the view)
SELECT a.id, p.first_name, p.last_name, p.email, a.status
FROM applications a
JOIN registration_personal_info p ON p.id = a.user_id
WHERE NOT EXISTS (SELECT 1 FROM department_answers x WHERE x.application_id = a.id);
```

### Move an application through the interview pipeline

```sql
UPDATE applications SET status = 'shortlisted' WHERE id = 123;
```

`status` is free text with a `'pending'` default and no constraint. Pick a vocabulary and use
it consistently; nothing in the app reads it back.

### Let someone re-apply after a mistake

The email index blocks a second application. To allow a retry:

```sql
DELETE FROM registration_personal_info WHERE lower(email) = lower('juan@example.com');
```

This cascades to `applications` and `department_answers`. **Destructive.** Prefer exporting
the row first if the previous answers matter.

### Rotate credentials

1. Rotate in the Neon console.
2. `neon env pull` locally (the dev server picks up a changed `DATABASE_URL` without restart,
   because `lib/pg.ts` compares URLs).
3. Update the host's environment variables and redeploy/restart there.

## Migrations

`npm run db:migrate` runs `db/schema.sql` as one query over the **direct** connection.

Rules:

- **Never** run it automatically at request time or during build.
- It is idempotent; re-running is safe and is the normal way to apply a schema change.
- `CREATE TABLE IF NOT EXISTS` does **not** alter existing tables. New columns on existing
  tables need an explicit, guarded `ALTER` in the file (see the `pup_webmail` and
  `course_year_section` `DROP NOT NULL` lines).
- Seeds only fire while `department_roles` / `department_questions` are empty, so they never
  overwrite admin data. They also mean a **newly added department gets no roles** — insert
  those manually.
- The RLS loop runs on every migration, so tables added to the file are locked automatically.
- Take a branch/backup before a migration that drops or rewrites data.

To test a migration safely: `neon checkout migration-test`, point
`DATABASE_URL_UNPOOLED` at it, run `npm run db:migrate`, inspect, then let the 7-day TTL clean
it up (or delete the branch).

## Health and monitoring

| Check | Where | Notes |
| ----- | ----- | ----- |
| App is serving | `GET /` (200, consent screen) | Safe for an uptime monitor |
| App can read the DB | `GET /register` (200, department options) | Fails loudly if the DB is unreachable |
| Postgres reachable | `SELECT 1;` in the console | |
| Object Storage | `GET /api/neon-health` in **development only** | Writes and deletes a test object |
| Submit path | One manual application per release | The highest-risk path; no automated tests exist |
| Errors | Server stdout/stderr | Only `console.error("[submitApplication] <slug>", err)` exists |

There is no APM, no error tracker, no metrics endpoint, and no automated test suite. The
practical minimum for a live cycle is a daily look at the host logs and a row count:

```sql
SELECT count(*) FROM applications WHERE created_at > now() - interval '1 day';
```

## Backups and recovery

- Use Neon's branching/instant restore to recover from accidental deletes. Treat the database
  as the only source of truth — the app stores no files.
- Object Storage holds only health-check litter (`healthcheck/*.txt`) today; there is nothing
  applicants upload.
- Before destructive admin SQL, `CREATE TABLE backup_x AS SELECT * FROM …` or branch first.

## Incident playbook

| Symptom | Likely cause | Action |
| ------- | ------------ | ------ |
| Every page 500s | Bad/missing `DATABASE_URL`, suspended compute | Check the Neon console, restore the branch, update env |
| `/register` 500s but `/` works | Database query failing (`getClosedSlugs`) | Same as above; check `departments` exists |
| Submits fail for everyone | Schema drift, or the role/newsletter question set changed under open forms | Check logs, run `npm run db:migrate`, ask applicants to reload |
| Submits fail for one person | Duplicate email, or a stale cookie set | Explain the one-email rule; clear cookies and retry |
| Department "missing" from the dropdown | Row `closed = true`, or slug mismatch between `departments.ts` and `departments.slug` | Fix the flag; verify slugs match |
| Users are redirected in a loop | Cookies blocked (privacy mode / third-party context) | The flow requires first-party cookies; there is no fallback |
| Health route 404 | Running a production build | Expected |
| Storage check fails in dev | `AWS_*` vars missing/stale, bucket missing | `neon deploy` / `neon env pull`, restart dev server |
| Confirmation page 404s | Slug not in `DEPARTMENTS` at build time | Add the department and rebuild |

## Pre-recruitment checklist

Run this before announcing the form:

- [ ] `npm run db:migrate` applied to the production branch, table list printed.
- [ ] `departments.closed` set correctly for every department.
- [ ] Each open department has the intended roles (`department_roles`).
- [ ] Each role has the intended **active** questions (`department_questions.active`).
- [ ] Question order (`position`) reads correctly on the live page.
- [ ] One end-to-end test application, then delete it so the test email is free.
- [ ] `GET /` and `GET /register` reachable over HTTPS.
- [ ] Environment variables set on the host (not just `.env.local`).
- [ ] Server logs visible to whoever is on call.
- [ ] Someone knows how to close a department mid-cycle.
- [ ] Someone owns the `application_answers` export during interviews.

## Known operational limitations

- No admin UI — every content change is SQL in the Neon console.
- No audit log of admin edits.
- No automated tests, no CI configuration in the repo.
- No rate limiting, CAPTCHA, or email verification; the only anti-spam control is the unique
  email index.
- No data retention or anonymisation process; applicant data persists until manually deleted.
- No cache invalidation concerns by design (pages are `force-dynamic`), but that also means
  every page load hits the database.
- One pool per server process with `pg` defaults (no `max`, no idle timeout tuning); if the
  hosting platform is serverless, read the `attachDatabasePool` note in `lib/pg.ts`.
