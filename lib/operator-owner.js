// lib/operator-owner.js - the first person to sign in owns app keys. Pure decision: the first claim wins; nobody else can take it. Never throws.
/** Who owns app keys after this sign-in: the recorded owner if there is one, otherwise this person (first claim). */
export function claimOwner(recordedUid, uid) {
  if (recordedUid) return { owner: String(recordedUid), claimed: false };
  if (!uid) return { owner: null, claimed: false };
  return { owner: String(uid), claimed: true };
}

/** Only the owner may change app keys. */
export function canManageKeys(ownerUid, uid) {
  return Boolean(ownerUid && uid && String(ownerUid) === String(uid));
}
