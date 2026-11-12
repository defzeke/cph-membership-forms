"use server";

import { cookies } from "next/headers";

import { getDepartment } from "@/app/register/departments";
import { COOKIE_PREFIX, registerFieldNames, registerSchema, toPersonalInfoRecord } from "@/app/register/personal-info";

import { pool } from "./pg";

const MAX_ANSWER_LENGTH = 5000;

// The only write path, run on the final Submit. Saves the personal info (carried in cookies until now),
// one applications row and one department_answers row per question, all or nothing.
export async function submitApplication(
  slug: string,
  role: string,
  answers: Record<string, string>, // question id -> answer
): Promise<{ error: string | null }> {
  const department = getDepartment(String(slug));
  if (!department) return { error: "This department is not accepting applications." };
  if (typeof role !== "string" || typeof answers !== "object" || answers === null) return { error: "Invalid submission." };

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
      `SELECT r.id, d.closed FROM department_roles r JOIN departments d ON d.id = r.department_id WHERE d.slug = $1 AND r.name = $2`,
      [department.slug, role],
    );
    if (!roleRow) return await fail("Please select a position before submitting.");
    if (roleRow.closed) return await fail("This department is not accepting applications.");

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

    const cols = Object.keys(info) as (keyof typeof info)[]; // fixed keys from toPersonalInfoRecord
    const { rows: [user] } = await client.query(
      `INSERT INTO registration_personal_info (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
      cols.map((c) => info[c]),
    );
    const { rows: [application] } = await client.query(
      "INSERT INTO applications (user_id, role_id) VALUES ($1, $2) RETURNING id",
      [user.id, roleRow.id],
    );
    if (ids.length) {
      await client.query(
        `INSERT INTO department_answers (application_id, role_id, question_id, answer)
         SELECT $1, $2, unnest($3::bigint[]), unnest($4::text[])`,
        [application.id, roleRow.id, ids, values],
      );
    }
    await client.query("COMMIT");
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
