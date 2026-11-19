import { pool } from "./pg";

// Departments an admin has closed; read per request so a toggle in cph-admin applies right away.
export async function getClosedSlugs(): Promise<string[]> {
  const { rows } = await pool.query<{ slug: string }>("SELECT slug FROM departments WHERE closed");
  return rows.map((r) => r.slug);
}

export type Question = { id: string; role: string; prompt: string };
export type Role = { name: string; category: string; teams: string[] | null; interview: boolean };

// Read on every request, so admin edits to roles and questions show up on the next page load.
// Roles with no category are retired: hidden here and rejected on submit.
export async function getRolesAndQuestions(slug: string): Promise<{ roles: Role[]; questions: Question[] }> {
  const { rows } = await pool.query<{ role: string; category: string; teams: string[] | null; interview: boolean; id: string | null; prompt: string | null }>(
    `SELECT r.name AS role, r.category, r.teams, r.interview, q.id::text AS id, q.prompt
     FROM department_roles r
     JOIN departments d ON d.id = r.department_id
     LEFT JOIN department_questions q ON q.role_id = r.id AND q.active
     WHERE d.slug = $1 AND r.category IS NOT NULL
     ORDER BY r.position, r.id, q.position, q.id`,
    [slug],
  );
  return {
    roles: [...new Map(rows.map((r) => [r.role, { name: r.role, category: r.category, teams: r.teams, interview: r.interview }])).values()],
    questions: rows.filter((r) => r.id !== null).map((r) => ({ id: r.id!, role: r.role, prompt: r.prompt! })),
  };
}

export const INTERVIEW_MINUTES = 20;

// Future 20-minute slots inside the department's windows that nobody has booked yet. $1 = department slug.
export const OPEN_SLOTS_SQL = `
  SELECT s AS slot
  FROM interview_windows w
  JOIN departments d ON d.id = w.department_id,
  generate_series(w.starts_at, w.ends_at - interval '${INTERVIEW_MINUTES} minutes', interval '${INTERVIEW_MINUTES} minutes') s
  WHERE d.slug = $1 AND s > now()
    AND NOT EXISTS (
      SELECT 1 FROM applications a JOIN department_roles r ON r.id = a.role_id
      WHERE r.department_id = d.id AND a.interview_at = s)
  ORDER BY s`;

// ISO strings, so only plain data reaches the client.
export async function getOpenSlots(slug: string): Promise<string[]> {
  const { rows } = await pool.query<{ slot: Date }>(OPEN_SLOTS_SQL, [slug]);
  return rows.map((r) => r.slot.toISOString());
}
