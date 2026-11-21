// Recorded SOP videos and new-hire procedure training (v286).
// A written procedure can link to a recorded video (Drive, YouTube, Loom and similar): only https links are accepted.
// A new person gets one "read and confirm" task per procedure they have not read at its current version, due over their first two weeks.
// Acknowledgements are kept by login, so a person without a login is matched by name. Pure: no I/O.
import { addDays, isIsoDate } from "./playbook";
import type { TaskInput } from "./tasks";
import type { StaffProcedure } from "./types";

export const MAX_VIDEO_URL = 500;

export type VideoLink = { ok: true; url: string | undefined } | { ok: false; error: string };

// Empty means no video. Anything else must be a plain https address with no username or password in it.
export function cleanVideoUrl(raw: unknown): VideoLink {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { ok: true, url: undefined };
  if (s.length > MAX_VIDEO_URL) return { ok: false, error: `The video link can be at most ${MAX_VIDEO_URL} characters.` };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: "The video link is not a valid address." };
  }
  if (u.protocol !== "https:" || !u.hostname) return { ok: false, error: "The video link must start with https://." };
  if (u.username || u.password) return { ok: false, error: "The video link cannot contain a username or password." };
  return { ok: true, url: u.toString() };
}

// Whether this person has read the procedure at its current version. A version change means it must be read again.
export function readAtCurrentVersion(p: Pick<StaffProcedure, "version" | "acks">, name: string): boolean {
  const who = name.trim().toLowerCase();
  if (!who) return false;
  return Object.values(p.acks ?? {}).some((a) => a.name.trim().toLowerCase() === who && a.version >= p.version);
}

// One reading task per procedure this person has not yet read at its current version, spread over their first two weeks.
export function procedureTrainingTasks(name: string, startIso: string, procedures: StaffProcedure[]): TaskInput[] | null {
  const who = name.trim();
  if (!who || !isIsoDate(startIso)) return null;
  const todo = procedures.filter((p) => !readAtCurrentVersion(p, who));
  return todo.map((p, i) => ({
    title: `Read and confirm: ${p.title}`,
    details: p.videoUrl
      ? `The written steps are on the Procedures page. There is also a recorded video: ${p.videoUrl}`
      : "The written steps are on the Procedures page. Confirm you have read them there.",
    assigneeName: who,
    assigneeKind: "outside" as const,
    dueDate: addDays(startIso, Math.min(14, 1 + i)),
    priority: "normal" as const,
  }));
}

// The link to store: the trimmed https address, or undefined when there is none or it is not allowed.
export function videoUrlOrUndefined(raw: unknown): string | undefined {
  const v = cleanVideoUrl(raw);
  return v.ok ? v.url : undefined;
}
