// lib/promo-tx.js - counts a discount-code use atomically, so two buyers cannot both take the last place (pure of server-firestore).
import { runTx } from './server/tx.js';

/** @returns {Promise<boolean>} true when this call took a use; false when the code is used up or gone. */
export async function claimPromoUse(db, promoRef, maxUses = null) {
  return runTx(db, async (tx) => {
    const s = await tx.get(promoRef);
    if (!s.exists()) return false;
    const uses = Number(s.data().uses) || 0;
    if (maxUses && uses >= maxUses) return false;
    tx.update(promoRef, { uses: uses + 1 });
    return true;
  });
}

/** Gives a use back when the invoice that claimed it could not be saved. */
export async function releasePromoUse(db, promoRef) {
  await runTx(db, async (tx) => {
    const s = await tx.get(promoRef);
    if (s.exists()) tx.update(promoRef, { uses: Math.max(0, (Number(s.data().uses) || 0) - 1) });
  }).catch(() => {});
}
