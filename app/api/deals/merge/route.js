// app/api/deals/merge/route.js - merges a duplicate lead into the one the owner keeps.
// The kept deal takes the combined stage, value, notes, tags and qualification, and records the merged-away email in mergedFrom.
// The duplicate's deal record is deleted; its outreach history then shows under the kept lead (the CRM reads mergedFrom).
import { NextResponse } from 'next/server';
import { doc, getDoc, setDoc, deleteDoc } from '../../../../lib/server-firestore.js';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { dealDocId } from '../../../../lib/deal-utils.js';
import { mergedDealFields } from '../../../../lib/lead-merge.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;

  const keep = String(body?.keepEmail || '').trim().toLowerCase();
  const drop = String(body?.dropEmail || '').trim().toLowerCase();
  if (!EMAIL.test(keep) || !EMAIL.test(drop)) return json({ error: 'Give the two lead emails.' }, 400);
  if (keep === drop) return json({ error: 'Pick two different leads to merge.' }, 400);

  const keepRef = doc(db, 'deals', dealDocId(who.uid, keep));
  const dropRef = doc(db, 'deals', dealDocId(who.uid, drop));
  const [keepSnap, dropSnap] = await Promise.all([getDoc(keepRef), getDoc(dropRef)]);
  const keepData = keepSnap.exists() ? keepSnap.data() : null;
  const dropData = dropSnap.exists() ? dropSnap.data() : null;

  const now = new Date().toISOString();
  const merged = mergedDealFields(keepData, dropData, { now });
  const mergedFrom = [...new Set([...(keepData?.mergedFrom || []), ...(dropData?.mergedFrom || []), drop])]
    .filter((e) => e !== keep);

  await setDoc(keepRef, {
    userId: who.uid,
    email: keep,
    ...merged,
    mergedFrom,
    ...(keepData ? {} : { createdAt: now }),
  }, { merge: true });

  if (dropSnap.exists()) await deleteDoc(dropRef);

  return json({ ok: true, keep, drop, stage: merged.stage, mergedFrom });
}
