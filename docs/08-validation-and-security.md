# 08 — Validation and security

This app handles personal data (names, email, phone, social profiles, a link to an ID
document) with no login system. The security model is deliberately small: **validate on the
client for UX, re-validate on the server for truth, and rely on the database for uniqueness
and referential integrity.**

## Validation rules

Single source of truth: `app/register/personal-info.ts` → `registerSchema` (Zod).

| Field | Schema | Rules | User-facing message |
| ----- | ------ | ----- | ------------------- |
| `firstName` | `string().trim().min(1)` | required, non-blank | First name is required |
| `lastName` | `string().trim().min(1)` | required, non-blank | Last name is required |
| `email` | `string().trim().email()` | valid email | Please enter a valid email address |
| `facebookLink` | `string().trim().url()` + refine | valid URL whose hostname contains `facebook.com` | Please enter a valid Facebook link / Please provide a valid Facebook link |
| `facebookSharedPost` | `string().trim().url()` + refine | same, hostname contains `facebook.com` | Please enter a valid Facebook link / Please provide a valid Facebook link to your shared post |
| `discordUsername` | `string().trim().min(1)` | required | Discord username is required |
| `linkedinLink` | `string().trim()` or `""` + refine | optional; if non-empty, hostname contains `linkedin.com` | Please enter a valid LinkedIn link |
| `phone` | `string().trim().regex(/^(09\d{9})?$/)` | optional; if non-empty, exactly `09` + 9 digits | Phone number must be in the format 09xxxxxxxxx |
| `certificateLink` | `string().trim()` + refine | optional; if non-empty, a URL whose hostname contains `drive.google.com` | Please provide a valid Google Drive link to your valid ID |
| `collegeCampus` | `string().trim().min(1)` | required | College or campus is required |
| `membershipType` | `string().trim().min(1)` | required | Department is required |

Notes:

- `.trim()` **transforms** before the other checks, so `"  Juan  "` is stored as `"Juan"`.
- `facebookLink` and `facebookSharedPost` require a *parseable* URL first
  (`.url()`), then a hostname check. The hostname check uses `includes`, not equality, so
  `https://m.facebook.com/...` passes (and `drive.google.com` subpaths for `certificateLink`). It also means a
  look-alike such as `https://facebook.com.evil.test` passes the hostname test — validation is
  about shape, not ownership.
- `linkedinLink` and `certificateLink` have **no** `.url()` — they only try `new URL(value)`, so
  they behave like a URL check but report a single custom message. The optional fields are
  `linkedinLink`, `phone`, and `certificateLink`; blank ones are stored as `NULL`.
- `membershipType` is validated but **not stored** (`toPersonalInfoRecord` omits it); it exists
  to route the applicant to a department.
- Zod 4 is in use. `string().email()` and `error.flatten()` are the legacy spellings still
  supported by Zod 4; `z.email()` and `z.flattenError()` are the modern equivalents if you
  refactor.

### Where validation runs

| Stage | Code | Scope |
| ----- | ---- | ----- |
| On blur | `registerSchema.shape[field].safeParse(value)` | one field |
| On submit (client) | `registerSchema.safeParse(values)` + `.flatten().fieldErrors` | all fields, blocks navigation |
| Cookie re-validation (server) | `registerSchema.safeParse(raw)` | all fields, blocks the transaction |
| Database | `CHECK` constraints, unique indexes, FKs | final backstop |

### Answer validation (department form)

| Layer | Rule |
| ----- | ---- |
| HTML | `<textarea required maxLength={5000}>`, `form.reportValidity()` before submit |
| Server action | trimmed non-empty, `length <= 5000`, keys must equal the active question id set |
| Database | `CHECK (char_length(answer) BETWEEN 1 AND 5000)` |

## The cookie model

### What is written

`register-form.tsx` writes one cookie per field after a successful client-side validation:

| Property | Value |
| -------- | ----- |
| Names | `registration_firstName`, `registration_lastName`, `registration_email`, `registration_facebookLink`, `registration_facebookSharedPost`, `registration_discordUsername`, `registration_linkedinLink`, `registration_phone`, `registration_certificateLink`, `registration_collegeCampus`, `registration_membershipType` |
| Encoding | `encodeURIComponent` on both name and value |
| Path | `/` |
| Max-Age | `60 * 60 * 24 * 30` (30 days) |
| SameSite | `Lax` |
| HttpOnly | **no** (must be readable by JS) |
| Secure | **no** (not set) |
| Signed / encrypted | **no** |

### Reading

- Client: `getSavedValuesFromCookies()` parses `document.cookie` on mount to prefill inputs.
- Server: `submitApplication` reads them with `cookies()` from `next/headers` and re-validates.
- Proxy: `lib/proxy.ts` checks seven of them for non-empty values to decide navigation.

### Consequences

- **The cookies contain PII in clear text** — name, email, phone, Facebook URLs, a Google Drive
  link to an ID. They persist for 30 days, are visible to any JavaScript running on the origin,
  and are stored unencrypted in the browser profile. An XSS bug on this origin would leak them.
  There are currently no third-party scripts on the pages, which limits exposure.
- **Cookies are not a security boundary.** They are client-writable, so any user can forge
  `registration_email` or `certificateLink`. That is exactly why the server re-runs
  `registerSchema` instead of trusting them.
- **They are never cleared.** After a successful submission the cookies remain, so a shared
  browser keeps the previous applicant's details prefilled.
- **They are sent on every same-origin request** under `path=/`, including `/api/neon-health`.
- Browser cookie limits (~4 KB per cookie) are far above the 2000-character server cap, so the
  cap is the practical limit.

### Guard vs. validation

`lib/proxy.ts` requires seven cookies; `registerSchema` has eleven fields, eight of them required
(`facebookSharedPost` is the gap; `linkedinLink`, `phone`, and `certificateLink` are optional).
The mismatch means the proxy can let someone through to a department page with an incomplete
set, only for the server action to reject at submit time. It fails safe, but it is not a great
UX. Adding `registration_facebookSharedPost` to `REQUIRED_REGISTRATION_COOKIES` aligns the two.

## Limits

| Limit | Value | Enforced in |
| ----- | ----- | ----------- |
| Cookie value length | 2000 chars | `lib/db.ts` (server action) |
| Answer length | 5000 chars | HTML `maxLength`, server check, DB `CHECK` |
| Cookie lifetime | 30 days | `COOKIE_MAX_AGE_SECONDS` |
| Answers per application | one per active question | PK + key-set equality check |
| Applications per email | 1 (case-insensitive) | unique index on `lower(email)` |
| Question prompt | non-empty | `CHECK (prompt <> '')` |
| Request body | Next.js default server-action limit | Next.js framework |

There is no limit on total applications, requests per minute, or answers per submission
beyond the question set.

## Threat model

| Threat | Current mitigation | Residual risk |
| ------ | ------------------ | ------------- |
| Forged personal info via edited cookies | Server re-validates with the same Zod schema | Cannot detect a *valid-looking* fake identity; no email verification |
| Cross-site request forgery on the submit action | Next.js server actions reject requests whose `Origin`/`Host` do not match | Depends on framework defaults; no explicit token |
| SQL injection | Every query is parameterised; no user value is interpolated into SQL text | Low |
| Mass spam applications | Unique email index stops repeats | No rate limit, CAPTCHA, or email verification; one fresh email per fake application is enough |
| Reading other applicants' data | No read endpoints exist for applicants; RLS with no policies locks out non-owner roles | The admin console account is the only reader |
| Path traversal / open redirect | Proxy only ever redirects to the fixed `/register`, preserving the requested path in a query param | Low |
| XSS | React escapes all interpolated values (including `?role=`); no `dangerouslySetInnerHTML` | Any future raw HTML would expose the PII cookies |
| ID document exposure | Only a Google Drive **link** is stored, not the file; bucket is private and unused by applicants | Link permissions are the applicant's responsibility |
| Enumeration of applicants | Duplicate-email error reveals that an email has applied | Minor privacy leakage, accepted |
| Health endpoint abuse | Returns 404 when `NODE_ENV === "production"` | Would be destructive if production ever ran with a non-production `NODE_ENV` |

## Database authorisation

Every table has RLS enabled with **no policies**, so:

- `neondb_owner` (the app server and the Neon console admin) bypasses RLS.
- Any other role — notably Data API `anonymous`/`authenticated` — sees zero rows and cannot
  write.

`application_answers` is declared `WITH (security_invoker = true)`, so reading the view does
not bypass the tables' RLS.

A new table added by a future migration is covered the next time `npm run db:migrate` runs,
because the RLS block loops over all `public` tables. A table created outside the migration
file would **not** be protected automatically.

## Data handling practices

- Personal data is written once, only on a successful submission, inside one transaction.
- Deletion is manual. `DELETE FROM registration_personal_info` cascades to applications and
  answers (the only cascade in the schema). Use Neon branching/instant restore if a mistake
  needs undoing.
- There is no retention policy, no anonymisation job, and no export tooling beyond SQL.

## Hardening checklist

If this form is going to handle real applicant data at scale, these are the highest-value
changes, in order:

1. **Stop carrying PII in cookies.** Keep a server-side draft (signed session cookie + row, or
   a draft table) and store only an opaque draft id in the browser.
2. **Set `Secure` and use the `__Host-` prefix** for the registration cookies, and consider
   short-lived, `HttpOnly`, signed values.
3. **Clear the cookies after a successful submit**, so shared devices do not retain details.
4. **Add a consent record** — timestamp and version of the privacy statement — if consent must
   be auditable.
5. **Rate-limit submissions** (per IP and per email) and consider a CAPTCHA, since the only
   anti-spam control today is the unique email index.
6. **Verify email ownership** (magic link) if one-application-per-person must be trustworthy.
7. **Align the proxy guard with the schema** by adding `registration_facebookSharedPost`.
8. **Add `import "server-only"` to `lib/questions.ts`** to make its server-only nature a build
   rule.
9. **Serve the whole site over HTTPS** and add HSTS at the hosting layer; the app sets no
   security headers itself (`next.config.ts` is empty).
