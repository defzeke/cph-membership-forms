// shortcut: no backend yet, rows are only logged; replace body with Neon (via server action/route) before going live.
export async function saveRecord(
  table: string,
  row: Record<string, unknown>,
): Promise<{ error: { message: string } | null }> {
  console.info(`[saveRecord] ${table}`, row);
  return { error: null };
}
