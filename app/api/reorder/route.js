// app/api/reorder/route.js - customers due for a reorder: paid before, not paid for a while, nothing unpaid now. Read only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { collection, getDocs, limit, query, where } from '../../../lib/server-firestore.js';
import { reorderCandidates, REORDER_AFTER_DAYS } from '../../../lib/products.js';

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  try {
    const snap = await getDocs(query(collection(getDb(), 'invoices'), where('userId', '==', who.uid), limit(2000)));
    const items = reorderCandidates({ invoices: snap.docs.map((d) => d.data()), now: Date.now(), afterDays: REORDER_AFTER_DAYS });
    return NextResponse.json({ items, afterDays: REORDER_AFTER_DAYS }, { headers: NO_STORE });
  } catch (e) {
    console.error('[reorder] read failed:', e.message);
    return NextResponse.json({ error: 'Could not read the customers. Try again.' }, { status: 500, headers: NO_STORE });
  }
}
