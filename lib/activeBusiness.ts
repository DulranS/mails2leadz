// Several businesses on one login.
//
// A person's `memberships/{uid}` pointer names the one business they signed up into; it is written once and never
// changes. Access to any business is decided by the member record inside that business (users/{biz}/members/{uid}),
// never by the pointer, so being a member of a second business already works at the database level. What was missing
// was a way to pick which business the app shows. This is that, and it only ever CHOOSES among businesses the person
// is an active member of; it grants nothing.
//
//   - The choice is kept in this browser (localStorage), per login. No choice = the pointer's business, exactly as before.
//   - If the chosen business no longer has an active member record for this person (removed, deactivated), the choice
//     is dropped and the pointer's business is used again. The app never leaves someone stuck on a business they lost.
//   - Businesses the person has joined are listed at memberships/{uid}/linked/{businessId} (a bookmark; access never
//     depends on it).

export const activeBusinessKey = (uid: string) => `balancr.activeBiz.${uid}`;

export interface MemberLike {
  active?: boolean;
}

// Which business to show, given the pointer, the stored choice, and what was found at the chosen business.
//   chosenMember: the person's member record at the chosen business: undefined = not looked up yet, null = none.
export function resolveActiveBusiness(
  pointerBusinessId: string | null,
  chosen: string | null,
  chosenMember: MemberLike | null | undefined
): { businessId: string | null; dropChoice: boolean } {
  if (!pointerBusinessId) return { businessId: null, dropChoice: false };
  if (!chosen || chosen === pointerBusinessId) return { businessId: pointerBusinessId, dropChoice: chosen === pointerBusinessId };
  // A choice that was not verified yet is shown (the live member subscription verifies it, and drops it if it fails).
  if (chosenMember === undefined) return { businessId: chosen, dropChoice: false };
  if (chosenMember === null || chosenMember.active === false) return { businessId: pointerBusinessId, dropChoice: true };
  return { businessId: chosen, dropChoice: false };
}

export interface LinkedBusiness {
  businessId: string;
  isPrimary: boolean;
}

// The list the switcher shows: the pointer's business first, then the linked ones, no repeats, no blanks.
export function listBusinesses(pointerBusinessId: string | null, linkedIds: string[]): LinkedBusiness[] {
  const out: LinkedBusiness[] = [];
  const seen = new Set<string>();
  if (pointerBusinessId) { out.push({ businessId: pointerBusinessId, isPrimary: true }); seen.add(pointerBusinessId); }
  for (const id of linkedIds) {
    if (typeof id === "string" && id !== "" && !seen.has(id)) { out.push({ businessId: id, isPrimary: false }); seen.add(id); }
  }
  return out;
}

// Server side: the business an API request is for. The browser says which business it is showing in an
// `x-business-id` header; that is only a request. The caller must still prove membership of THAT business by its
// member record (active, with a role), exactly as for the pointer's business; a header naming a business the person
// does not belong to simply fails that check. No header, an equal one, or a malformed one means the pointer's business,
// as before. The format check keeps the value safe to use in a Firestore path.
export const BUSINESS_ID_HEADER = "x-business-id";
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function pickRequestBusiness(pointerBusinessId: string, headerValue: string | null | undefined): string {
  const h = (headerValue ?? "").trim();
  return SAFE_ID.test(h) ? h : pointerBusinessId;
}
