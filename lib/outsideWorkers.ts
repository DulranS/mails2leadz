// Freelancers and contractors with no login to this business. Their hours are logged by the owner or a manager against a
// stable identity, so the same person's hours add up across days. Nobody outside the business can sign in as them.
//
// The identity is the lower-cased name, so "Nimal" and "nimal " are one person, and names in any script (Sinhala, Tamil, Latin)
// all work. Two different people typed with the exact same name become one identity: use "Nimal K" and "Nimal S" to tell them apart.
export const OUTSIDE_PREFIX = "outside:";
export const MAX_OUTSIDE_NAME = 100;

export function validateOutsideName(name: unknown): string | null {
  const n = typeof name === "string" ? name.trim() : "";
  if (!n) return "Type the freelancer's or contractor's name.";
  if (n.length > MAX_OUTSIDE_NAME) return `Keep the name to ${MAX_OUTSIDE_NAME} characters.`;
  return null;
}

export function outsideWorkerUid(name: string): string {
  return OUTSIDE_PREFIX + encodeURIComponent(name.trim().replace(/\s+/g, " ").toLowerCase());
}

export const isOutsideWorkerUid = (uid: unknown): boolean => typeof uid === "string" && uid.startsWith(OUTSIDE_PREFIX);
