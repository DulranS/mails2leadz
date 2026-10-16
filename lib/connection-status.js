// lib/connection-status.js - turns the /api/system-check answer into "can the server save to the database?" (pure, so it is tested).
/** @returns {{ detail: string, fix: string } | null}  null when the database checks pass (or the answer is unusable: never a false alarm). */
export function storageProblem(data) {
  const checks = Array.isArray(data?.checks) ? data.checks : [];
  const failed = checks.filter((c) => c && c.ok === false && (c.id === 'database' || c.id === 'admin'));
  if (!failed.length) return null;
  return { detail: String(failed[0].detail || ''), fix: String(failed.map((c) => c.fix).find(Boolean) || '') };
}
