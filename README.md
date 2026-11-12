This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Backend (Neon)

Services are declared in `neon.ts`. `neon deploy` provisions them and writes env vars to `.env.local`.

- **Postgres**: the final Submit calls the `submitApplication` server action (`lib/db.ts`), the only write path. Personal info rides in cookies until then and is re-validated on the server. Writes go over the pooled `DATABASE_URL` with `pg`. Schema is in `db/schema.sql`; apply it with `npm run db:migrate` (uses `DATABASE_URL_UNPOOLED`).
- **Object Storage**: `lib/storage.ts` (S3 client, bucket `assets`).
- **Realtime**: enabled on the branch but unused: it rejects tables with RLS on, and every table has RLS.

In dev, `GET /api/neon-health` tests Postgres and Object Storage end to end (404 in production).

### Data model

`db/schema.sql` is the source of truth (comments at the top list every table). In short:

- `registration_personal_info`: the applicant ("user"), saved together with the application on the final Submit.
- `departments` → `department_roles` → `department_questions`: positions and screening questions. Edit these rows in the Neon console (Tables view); the form reads them on every page load. To change what a question asks, set `active = false` and add a new row, so old answers keep their original question.
- `applications`: one row per applicant per role, `status` tracks the interview.
- `department_answers`: one row per answer, keyed by application and question.
- `application_answers` (view): everything joined, with user id and department id, for reading answers.

Every table has RLS on with no policies, so only the owner role (the app server and you) can read or write.

