import { pool } from "./pg";

// Departments an admin has closed; read per request so a toggle in cph-admin applies right away.
export async function getClosedSlugs(): Promise<string[]> {
  const { rows } = await pool.query<{ slug: string }>("SELECT slug FROM departments WHERE closed");
  return rows.map((r) => r.slug);
}

export type Question = { id: string; role: string; prompt: string };

// Read on every request, so admin edits to roles and questions show up on the next page load.
export async function getRolesAndQuestions(slug: string): Promise<{ roles: string[]; questions: Question[] }> {
  const { rows } = await pool.query<{ role: string; id: string | null; prompt: string | null }>(
    `SELECT r.name AS role, q.id::text AS id, q.prompt
     FROM department_roles r
     JOIN departments d ON d.id = r.department_id
     LEFT JOIN department_questions q ON q.role_id = r.id AND q.active
     WHERE d.slug = $1
     ORDER BY r.position, r.id, q.position, q.id`,
    [slug],
  );
  return {
    roles: [...new Set(rows.map((r) => r.role))],
    questions: rows.filter((r) => r.id !== null).map((r) => ({ id: r.id!, role: r.role, prompt: r.prompt! })),
  };
}
