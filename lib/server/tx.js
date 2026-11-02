// lib/server/tx.js - one transaction helper for both database modes (server SDK, or the browser SDK in login mode).
// A transaction reads and writes atomically: two requests cannot both act on the same credit note or discount use.
export async function runTx(db, fn) {
  if (typeof db.runTransaction === 'function') return db.runTransaction(fn);
  const client = await import('firebase/firestore');
  return client.runTransaction(db, fn);
}
