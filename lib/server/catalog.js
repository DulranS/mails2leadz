// lib/server/catalog.js - saves and reads the business catalog (products, services, packages, offers, bundles, stock). Never throws.
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { getDb } from './route-helpers.js';
import { parseCatalog, catalogBlock, lowStockItems } from '../catalog.js';

export async function saveCatalog(db, uid, text) {
  const { items, skipped } = parseCatalog(text);
  await setDoc(doc(db, 'users', uid, 'settings', 'business'), { catalog: items }, { merge: true });
  return { ok: true, saved: items.length, skipped };
}

export async function loadCatalog(db, uid) {
  return (await getDoc(doc(db, 'users', uid, 'settings', 'business')).then((s) => s.data()?.catalog || []).catch(() => []));
}

/** The AI's context block for this owner's catalog, or empty when there is none. */
export async function catalogBlockFor(uid) {
  try { return catalogBlock(await loadCatalog(getDb(), uid)); } catch (e) { return ''; }
}

export async function lowStockCount(db, uid) {
  try { return lowStockItems(await loadCatalog(db, uid)).length; } catch (e) { return 0; }
}
