# 04 — User flow

The registration journey is four screens, three of which are guarded by the proxy. This
document walks each step, what state it holds, and every message a user can see.

```text
/  ──consent──▶  /register  ──valid details──▶  /register/<department>  ──submit──▶  /register/<department>/submit
   (client)         (cookies)                     (cookies + live data)                (confirmation)
```

## Step 0 — Privacy consent (`/`)

**File:** `app/page.tsx` (client component)

Two required radios:

| Value | Label | Effect |
| ----- | ----- | ------ |
| `consent` | "I acknowledge that I understand and consent to the provision of my information." | Submits → `router.push("/register")` |
| `decline` | "I do not wish to provide my information." | Submits → stays on `/` and shows a rose banner |

Decline message:

> You selected “I do not wish to provide my information.” Registration cannot continue.

There is no server-side record of the consent choice and no consent timestamp in the
database. The screen is a gate, not an audit trail (**known limitation**).

## Step 1 — Personal information (`/register`)

**Files:** `app/register/page.tsx` (server) → `app/register/register-form.tsx` (client),
rules in `app/register/personal-info.ts`.

### What the page loads

The server page calls `getClosedSlugs()` and passes the resulting `string[]` to the client
form. The department `<option>` list comes from the static `DEPARTMENTS` array; options whose
slug is in `closed` are `disabled` and labelled `" (closed)"`.

### Fields

| Field | Input type | Required | Rule (see `08-validation-and-security.md` for exact messages) |
| ----- | ---------- | -------- | ------------------------------------------------------------- |
| First Name | `text` | yes | non-empty, trimmed |
| Last Name | `text` | yes | non-empty, trimmed |
| Email Address | `email` | yes | valid email, trimmed |
| Facebook Link | `url` | yes | valid URL on `facebook.com` |
| Facebook Shared Post | `url` | yes | valid URL on `facebook.com`; has a `?` tooltip: "The link to your shared post of CyberPH's Recruitment" |
| Discord Username | `text` | yes | non-empty, trimmed |
| LinkedIn Link | `url` | no | empty allowed; if present must be a `linkedin.com` URL |
| Phone Number | `tel` | yes | `09` + 9 digits (11 characters) |
| Valid ID (school or government ID) | `url` | yes | valid URL on `drive.google.com` |
| College/campus | `text` | yes | non-empty, trimmed |
| Department | `select` | yes | one of the eight department names; closed ones disabled |

The `<form>` carries `noValidate`, so the browser never blocks submission — Zod is the single
source of truth. Native attributes (`required`, `pattern="09[0-9]{9}"`, `minLength`,
`maxLength`, `inputMode="numeric"`) remain for mobile keyboards and accessibility hints.

### Validation behaviour

- **On blur:** `registerSchema.shape[field].safeParse(value)` validates the single field and
  writes/clears that field's error. No page-level re-validation.
- **On submit:** the whole form is read with `FormData`, validated with
  `registerSchema.safeParse(values)`, and flattened into per-field errors.
- **On success:** every field is written to a cookie and the user is routed to the
  department page.

### Cookie persistence

```ts
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

document.cookie =
  `${encodeURIComponent(`${COOKIE_PREFIX}${field}`)}=${encodeURIComponent(value)}` +
  `; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
```

- Prefix: `registration_` (`COOKIE_PREFIX`).
- Names: `registration_firstName`, `registration_lastName`, … one per
  `registerFieldNames` entry, including `membershipType`.
- Lifetime: 30 days, `path=/`, `SameSite=Lax`.
- Not `HttpOnly`, not `Secure` — they must be readable by client JS.

On mount the form rehydrates `defaultValue`s from `document.cookie`, so returning to
`/register` (including via the "Previous" button on the department page) repopulates
everything.

### Department routing

```ts
const department = DEPARTMENTS.find(
  (d) => d.name === result.data.membershipType && !closed.includes(d.slug),
);
if (department) {
  router.push(`/register/${department.slug}`);
  return;
}
setErrors({ membershipType: "Please select an open department." });
```

The select stores the department **name**, not the slug, so this lookup converts name → slug.
Because closed options are disabled, the error is normally unreachable through the UI — but
a stale `membershipType` cookie pointing at a now-closed department will be preselected,
still visible, and rejected here.

### Redirect banner

If the proxy bounced the user (missing cookies), the URL looks like
`/register?redirect=/register/technology-department`, and the form shows:

> Before continuing to another page, please fill in all required fields here first.

The query string is cosmetic: nothing reads `redirect` to resume navigation. After a
successful submit the user always lands on the department page of their choice.

## Step 2 — Department application (`/register/[department]`)

**Files:** `app/register/[department]/page.tsx` (server) →
`app/register/[department]/department-form.tsx` (client), queries in `lib/questions.ts`.

### Server-side gates, in order

1. `getDepartment(department)` — unknown slug → `notFound()` (404).
2. `getClosedSlugs()` includes the slug → `redirect("/register")`.
3. `getRolesAndQuestions(department)` → `{ roles, questions }`.

The page then renders:

- the department name and description from `DEPARTMENTS`,
- a link to the external role primer (Google Docs),
- one required radio per role,
- the questions for the selected role,
- "Previous" (back to `/register`) and "Submit".

### Questions

`getRolesAndQuestions` returns a flat list of `{ id, role, prompt }` ordered by
`r.position, r.id, q.position, q.id`, and the client filters by `question.role === selectedRole`.
This means all roles' questions are sent to the browser even though only one role's set is
shown — acceptable because the content is not sensitive.

Roles are grouped under **Executives**, **Leads**, and **Committee Members** by
`department_roles.category`. A role with no category is retired: it isn't listed, and the
server rejects a submit for it. A role with no active questions still lists and submits with
zero answers.

Committee roles (for example "Partnerships Committee") can carry a list of teams in
`department_roles.teams`. Picking one shows a required "Which team would you like to join?"
dropdown; entries written `Group / Team` (Operations' `Guest Relations / Event Hosts`) are shown
under a `Group` heading. The questions are the committee's, whatever team is picked. The
server only accepts a team from that list, and stores it in `applications.team`.

The intro above the questions says the answers are the first part of the evaluation, and only
applicants who pass move on to the interview.

### Interview schedule

Once a role is picked, and the department has open slots, the form asks for a date and a
20-minute time slot (Philippine time). Slots come from `interview_windows`, one applicant per
slot per department, and booked or past slots are left out. The server re-checks the slot
inside the transaction; if someone took it first the applicant sees "That interview slot was
just taken. Please pick another one." A department with no windows, or none left, skips the
picker and saves `interview_at = NULL`. So do roles with `department_roles.interview = false`
(General Member, Creatives' Floor Committee).

The open slots are re-fetched every 5 seconds (`listOpenSlots`), so a slot someone else books
disappears while the page is open; if it was the one picked, the picker clears it and says so.

### Reschedule

On submit with a slot, the server sets an httpOnly cookie `cph_application` (`<id>.<token>`,
5 hours). The confirmation page reads it (`getBooking`), shows the booked time, and offers
**Reschedule** with the same live picker until 5 hours after the application was created.
`rescheduleInterview` re-checks the token, the 5-hour window, and the slot inside a
transaction. After 5 hours, or in another browser, the box doesn't show.

### General Member

`General Member` (slug `member`) is the first option in the department dropdown. Its page
(`member-form.tsx`) has no questions and no scheduler: it says member benefits will be
announced at the general onboarding, and a "Yes, I want to join" button submits role `Member`
with no answers, no slot, and no team.

### Submit

```ts
if (!event.currentTarget.reportValidity()) return;   // native required/maxLength
setSubmitError(null);
setIsSubmitting(true);

const formData = new FormData(event.currentTarget);
const answers = Object.fromEntries(
  roleQuestions.map((q) => [q.id, String(formData.get(`question-${q.id}`) ?? "")]),
);
const { error } = await submitApplication(department.slug, selectedRole, answers, interviewAt || null, team || null);
```

- Input names are `question-<question id>`.
- Each `<textarea>` has `maxLength={5000}` and `required`.
- The Submit button is disabled and reads **"Saving…"** while the action is in flight.
- On success → `router.push("/register/<slug>/submit?role=<role>")`.
- On failure → the returned message is rendered in a rose panel above the buttons; the user
  stays on the page with their text intact.

### Errors shown on this screen

All strings come from `lib/db.ts`.

| Message | Trigger |
| ------- | ------- |
| `This department is not accepting applications.` | Unknown slug, or the department was closed after the page loaded |
| `Invalid submission.` | Malformed `role`/`answers` arguments |
| `Missing or invalid personal information. Please check the Personal Information page.` | Cookies failed `registerSchema`, or any cookie value exceeds 2000 characters |
| `Please select a position before submitting.` | `role` does not match a `department_roles.name` row for that department |
| `The questions were just updated. Please reload the page and answer them again.` | Submitted answer keys differ from the live active question set |
| `Please answer every question (up to 5000 characters each).` | An answer is blank/whitespace or longer than 5000 characters |
| `This email has already been used to apply. Each email can only apply once.` | `registration_personal_info_email_key` unique violation |
| `Could not save your submission. Please try again.` | Any other database/transaction error (also logged server-side) |

## Step 3 — Confirmation (`/register/[department]/submit`)

**Files:** `app/register/[department]/submit/page.tsx` (static) +
`app/register/submission-confirmation.tsx` (client).

- Heading: **"Thanks for signing up!"**
- Social links: Facebook (`facebook.com/LearnCyberPH`), LinkedIn
  (`linkedin.com/company/cyberphilippines`), and a note that the Discord server is coming.
- Confirmation line reads `?role=` from the URL:
  - with `role`: "You have successfully submitted your application for the role of
    <role>."
  - without: "You have successfully submitted your application."

Only the eight known slugs exist (`dynamicParams = false`), but the page itself is stateless:
reloading it, or visiting it with a different `?role=`, produces the same confirmation with no
database check (**known limitation** — there is no "did this submission exist?" verification).

## State ownership summary

| State | Lives in | Lifetime | Cleared when |
| ----- | -------- | -------- | ------------ |
| Consent choice | React state in `app/page.tsx` | Until navigation | Leaving `/` |
| Personal info (draft) | `registration_*` cookies | 30 days | Browser/user clears cookies; the app never clears them |
| Closed department list | Server response per request | One render | Next request |
| Roles and questions | Server response per request | One render | Next request |
| Selected role | React state in `department-form.tsx` | Until navigation | Page unload |
| Answers | Uncontrolled textareas | Until navigation | Successful submit navigates away |
| Submitted application | Postgres | Forever | Manual admin deletion |

## Journey edge cases

| Situation | Result |
| --------- | ------ |
| Deep-link to `/register/<dept>` with no cookies | Proxy redirects to `/register?redirect=…` |
| Deep-link to `/register/does-not-exist` with cookies | `notFound()` → 404 |
| Department closed between load and submit | Submit error: "This department is not accepting applications." |
| Admin deactivates a question mid-form | Submit error asking the user to reload |
| Applicant applies twice with the same email (any casing) | Submit error; the unique index is on `lower(email)` |
| Applicant changes department on the personal-info page | Cookies overwritten, new department page loaded |
| Applicant presses "Previous" | Returns to `/register` with all fields prefilled from cookies |
| Applicant opens the confirmation URL directly | Renders success copy regardless of history |
| Applicant's clock/cookie expiry passes mid-flow | Proxy sends them back to `/register`; earlier typed answers are gone |
