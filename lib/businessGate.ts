// Server only. Finds a business that may take outside input (an enquiry, a lead through the API): the id is well formed, the
// business exists, and its account is not locked. Null for all three, so a caller learns nothing about the account. Uses the
// Admin SDK; never returns more than the name and the settings the caller needs.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveAccess, type AccessInput } from "@/lib/accountAccess";
import { isValidBusinessId } from "@/lib/enquiry";
import type { Settings } from "@/lib/types";

export async function openBusinessAdmin(businessId: string) {
  if (!isValidBusinessId(businessId)) return null;
  const db = getAdminDb();
  const base = db.collection("users").doc(businessId);
  const [settingsSnap, ownerSnap, accountSnap] = await Promise.all([
    base.collection("meta").doc("settings").get(),
    base.collection("members").doc(businessId).get(),
    base.collection("meta").doc("account").get(),
  ]);
  if (!settingsSnap.exists && !ownerSnap.exists) return null;
  if (resolveAccess(accountSnap.data() as AccessInput | undefined).locked) return null;
  const settings = (settingsSnap.data() ?? {}) as Partial<Settings> & { businessName?: string };
  return { db, base, name: settings.businessName ?? "", settings };
}
