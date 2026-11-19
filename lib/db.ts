"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { PoolClient } from "pg";

import { getDepartment } from "@/app/register/departments";
import { COOKIE_PREFIX, registerFieldNames, registerSchema, toPersonalInfoRecord } from "@/app/register/personal-info";

import { pool } from "./pg";
import { getOpenSlots, OPEN_SLOTS_SQL } from "./questions";

const MAX_ANSWER_LENGTH = 5000;
const RESCHEDULE_COOKIE = "cph_application"; // "<application id>.<reschedule token>", set on submit
const RESCHEDULE_HOURS = 5;

// Inside a transaction: locks the department so two applicants can't book the same slot at once,
// then returns its open slots.
async function lockOpenSlots(client: PoolClient, slug: string): Promise<string[]> {
  await client.query("SELECT 1 FROM departments WHERE slug = $1 FOR UPDATE", [slug]);
  const { rows } = await client.query<{ slot: Date }>(OPEN_SLOTS_SQL, [slug]);
  return rows.map((r) => r.slot.toISOString());
}

// Polled by the slot pickers so a slot someone else just took disappears.
export async function listOpenSlots(slug: string): Promise<string[]> {
  return getDepartment(String(slug)) ? getOpenSlots(slug) : [];
}

// The only write path, run on the final Submit. Saves the personal info (carried in cookies until now),
// one applications row and one department_answers row per question, all or nothing.
export async function submitApplication(
  slug: string,
  role: string,
  answers: Record<string, string>, // question id -> answer
  interviewAt: string | null, // ISO start of the picked slot, from getOpenSlots
  team: string | null, // one of the role's teams, when it has any
): Promise<{ error: string | null }> {
  const department = getDepartment(String(slug));
  if (!department) return { error: "This department is not accepting applications." };
  if (typeof role !== "string" || typeof answers !== "object" || answers === null) return { error: "Invalid submission." };
  if ((interviewAt !== null && typeof interviewAt !== "string") || (team !== null && typeof team !== "string")) {
    return { error: "Invalid submission." };
  }

  // Cookies are browser-controlled: re-validate with the same schema as the form, and cap sizes.
  const jar = await cookies();
  const raw = Object.fromEntries(registerFieldNames.map((f) => [f, jar.get(COOKIE_PREFIX + f)?.value ?? ""]));
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success || Object.values(raw).some((v) => v.length > 2000)) {
    return { error: "Missing or invalid personal information. Please check the Personal Information page." };
  }
  const info = toPersonalInfoRecord(parsed.data);

  const client = await pool.connect();
  const fail = async (error: string) => {
    await client.query("ROLLBACK");
    return { error };
  };
  try {
    await client.query("BEGIN");
    const { rows: [roleRow] } = await client.query(
      `SELECT r.id, r.interview, r.teams, d.closed FROM department_roles r JOIN departments d ON d.id = r.department_id
       WHERE d.slug = $1 AND r.name = $2 AND r.category IS NOT NULL`,
      [department.slug, role],
    );
    if (!roleRow) return await fail("Please select a position before submitting.");
    if (roleRow.closed) return await fail("This department is not accepting applications.");
    const teams: string[] = roleRow.teams ?? [];
    if (teams.length ? !teams.includes(team!) : team !== null) return await fail("Please pick a team.");

    // Answers must match the live question set exactly; an admin edit mid-form means a reload.
    const { rows: questions } = await client.query(
      "SELECT id::text AS id FROM department_questions WHERE role_id = $1 AND active",
      [roleRow.id],
    );
    const ids: string[] = questions.map((q) => q.id);
    const values = ids.map((id) => (Object.hasOwn(answers, id) ? answers[id] : undefined));
    if (Object.keys(answers).length !== ids.length || values.some((v) => typeof v !== "string")) {
      return await fail("The questions were just updated. Please reload the page and answer them again.");
    }
    if (values.some((v) => !v!.trim() || v!.length > MAX_ANSWER_LENGTH)) {
      return await fail(`Please answer every question (up to ${MAX_ANSWER_LENGTH} characters each).`);
    }

    let interview: string | null = null;
    if (roleRow.interview) {
      const slots = await lockOpenSlots(client, department.slug);
      // No slot is fine only when the department has none left (or never set any).
      if (interviewAt ? !slots.includes(interviewAt) : slots.length > 0) {
        return await fail(interviewAt ? "That interview slot was just taken. Please pick another one." : "Please pick an interview schedule.");
      }
      interview = interviewAt;
    }

    const token = interview ? randomBytes(24).toString("base64url") : null;
    const cols = Object.keys(info) as (keyof typeof info)[]; // fixed keys from toPersonalInfoRecord
    const { rows: [user] } = await client.query(
      `INSERT INTO registration_personal_info (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
      cols.map((c) => info[c]),
    );
    const { rows: [application] } = await client.query(
      "INSERT INTO applications (user_id, role_id, interview_at, team, reschedule_token) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [user.id, roleRow.id, interview, team, token],
    );
    if (ids.length) {
      await client.query(
        `INSERT INTO department_answers (application_id, role_id, question_id, answer)
         SELECT $1, $2, unnest($3::bigint[]), unnest($4::text[])`,
        [application.id, roleRow.id, ids, values],
      );
    }
    await client.query("COMMIT");
    if (!token) jar.delete(RESCHEDULE_COOKIE);
    else {
      jar.set(RESCHEDULE_COOKIE, `${application.id}.${token}`, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: RESCHEDULE_HOURS * 3600,
      });
    }
    return { error: null };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if ((err as { constraint?: string }).constraint === "registration_personal_info_email_key") {
      return { error: "This email has already been used to apply. Each email can only apply once." };
    }
    console.error(`[submitApplication] ${department.slug}`, err);
    return { error: "Could not save your submission. Please try again." };
  } finally {
    client.release();
  }
}

export type Booking = { slug: string; interviewAt: string; deadline: string; slots: string[] };

// The applicant's own booking, found by the cookie set on submit. null once the reschedule window is over.
export async function getBooking(): Promise<Booking | null> {
  const [id, token] = ((await cookies()).get(RESCHEDULE_COOKIE)?.value ?? "").split(".");
  if (!id || !token || !/^[0-9]+$/.test(id)) return null;
  const { rows: [row] } = await pool.query(
    `SELECT d.slug, a.interview_at, a.created_at + interval '${RESCHEDULE_HOURS} hours' AS deadline
     FROM applications a JOIN department_roles r ON r.id = a.role_id JOIN departments d ON d.id = r.department_id
     WHERE a.id = $1 AND a.reschedule_token = $2 AND a.interview_at IS NOT NULL
       AND a.created_at > now() - interval '${RESCHEDULE_HOURS} hours'`,
    [id, token],
  );
  if (!row) return null;
  return { slug: row.slug, interviewAt: row.interview_at.toISOString(), deadline: row.deadline.toISOString(), slots: await getOpenSlots(row.slug) };
}

export async function rescheduleInterview(interviewAt: string): Promise<{ error: string | null }> {
  if (typeof interviewAt !== "string") return { error: "Invalid request." };
  const [id, token] = ((await cookies()).get(RESCHEDULE_COOKIE)?.value ?? "").split(".");
  if (!id || !token || !/^[0-9]+$/.test(id)) return { error: "Rescheduling isn't available for this application." };

  const client = await pool.connect();
  const fail = async (error: string) => {
    await client.query("ROLLBACK");
    return { error };
  };
  try {
    await client.query("BEGIN");
    const { rows: [row] } = await client.query(
      `SELECT a.id, d.slug, a.created_at > now() - interval '${RESCHEDULE_HOURS} hours' AS open
       FROM applications a JOIN department_roles r ON r.id = a.role_id JOIN departments d ON d.id = r.department_id
       WHERE a.id = $1 AND a.reschedule_token = $2 AND a.interview_at IS NOT NULL FOR UPDATE OF a`,
      [id, token],
    );
    if (!row) return await fail("Rescheduling isn't available for this application.");
    if (!row.open) return await fail(`Rescheduling closed ${RESCHEDULE_HOURS} hours after you applied.`);
    if (!(await lockOpenSlots(client, row.slug)).includes(interviewAt)) {
      return await fail("That interview slot was just taken. Please pick another one.");
    }
    await client.query("UPDATE applications SET interview_at = $2 WHERE id = $1", [row.id, interviewAt]);
    await client.query("COMMIT");
    return { error: null };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[rescheduleInterview]", err);
    return { error: "Could not save the new schedule. Please try again." };
  } finally {
    client.release();
  }
}
