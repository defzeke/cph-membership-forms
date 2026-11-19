# CyberPH Membership Registration — Documentation

This `docs/` folder documents the **CPH Membership Forms** application: a Next.js 16
registration form for CyberPH membership applications, backed by Neon Postgres and
Neon Object Storage.

The docs are written for two audiences: developers working on the code, and maintainers
running the deployed form (migrations, opening/closing departments, troubleshooting).

## What the app does

An applicant goes through four screens:

1. **Privacy consent** (`/`) — acknowledge the data privacy statement.
2. **Personal information** (`/register`) — name, contact details, social links, valid ID
   link, college/campus, and department choice. Answers are held in browser cookies.
3. **Department application** (`/register/[department]`) — pick a position and answer that
   position's screening questions. Submitting runs the only database write in the app.
4. **Confirmation** (`/register/[department]/submit`) — success message and social links.

Departments, positions, and questions are **data**, not code: they live in Postgres and are
edited from the Neon console, so the form picks up changes on the next page load.

## Stack at a glance

| Layer     | Technology                                                              |
| --------- | ----------------------------------------------------------------------- |
| Framework | Next.js `^16.4.5` (App Router, Server Components, server actions)        |
| UI        | React `19.2.3`, Tailwind CSS `^4` (CSS-first `@theme`), Lenis `^1.3.18`  |
| Validation| Zod `^4.3.6`                                                             |
| Database  | Neon Postgres via `pg` `^8.23.1` (pooled) and direct connection for DDL  |
| Storage   | Neon Object Storage / S3 API (`@aws-sdk/client-s3` `^3.1165.0`)         |
| Config    | `@neon/config/v1` (`neon.ts`)                                            |
| Language  | TypeScript `^5`, strict mode, path alias `@/*` → repo root               |

> **Important:** this project targets **Next.js 16**. The middleware convention has been
> renamed to **Proxy** (`proxy.ts` at the repo root), and the proxy runtime is Node.js, not
> Edge. If you are used to `middleware.ts`, read `03-architecture.md` before editing it.

## Reading order

| #  | Document | Read it when |
| -- | -------- | ------------ |
| 01 | [Overview](./01-overview.md) | You are new to the repo |
| 02 | [Getting started](./02-getting-started.md) | You need to run it locally |
| 03 | [Architecture](./03-architecture.md) | You need to understand request flow and rendering |
| 04 | [User flow](./04-user-flow.md) | You are changing the registration journey |
| 05 | [Routes and files](./05-routes-and-files.md) | You are looking for where something lives |
| 06 | [Data model](./06-data-model.md) | You are touching SQL, roles, or questions |
| 07 | [Backend](./07-backend.md) | You are changing the submit path or data access |
| 08 | [Validation and security](./08-validation-and-security.md) | You are changing rules, cookies, or limits |
| 09 | [UI and branding](./09-ui-and-branding.md) | You are changing styles, banners, or theme |
| 10 | [Operations](./10-operations.md) | You are deploying or maintaining a live form |

## Conventions used here

- File paths are relative to the repository root.
- Code and SQL snippets are copied from the source; line-level comments in the source are
  the authority if the two ever disagree.
- "The admin" means whoever edits rows in the Neon console (`cph-admin` is the name the
  source comments use for that workflow).
- Anything marked **Known limitation** is behaviour of the current code, not a bug report
  requirement — it is documented so it is not mistaken for an oversight.

## Documentation status

Written by reading the full tracked source tree. Covers every tracked file, the SQL schema
and seeds, `neon.ts`, and the Next.js 16 conventions shipped in `node_modules/next/dist/docs`.

When you change behaviour, update the matching doc in the same commit. The most
change-prone spots are `06-data-model.md` (schema edits), `07-backend.md` (submit
contract), `08-validation-and-security.md` (Zod rules), and `10-operations.md` (env vars).
