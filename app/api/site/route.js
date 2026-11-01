// app/api/site/route.js - PUBLIC (listed in proxy.js). The public landing page's content for an account, by its enquiry key.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { isAdminMode, collection, doc, getDoc, getDocs, limit, query } from '../../../lib/server-firestore.js';
import { ownerFromKey } from '../../../lib/server/owner-key.js';
import { publicSite } from '../../../lib/site.js';

export async function GET(request) {
  if (!isAdminMode()) return NextResponse.json({ error: 'Not available.' }, { status: 503, headers: NO_STORE });
  const db = getDb();
  const uid = await ownerFromKey(db, request.nextUrl.searchParams.get('k'));
  if (!uid) return NextResponse.json({ error: 'This page is not available.' }, { status: 404, headers: NO_STORE });
  try {
    const [biz, site, svcs, prods] = await Promise.all([
      getDoc(doc(db, 'users', uid, 'settings', 'business')),
      getDoc(doc(db, 'users', uid, 'settings', 'site')),
      getDocs(query(collection(db, 'users', uid, 'services'), limit(20))),
      getDocs(query(collection(db, 'users', uid, 'products'), limit(50))),
    ]);
    return NextResponse.json(publicSite({
      businessName: biz.exists() ? biz.data().businessName : '',
      site: site.exists() ? site.data() : {},
      services: svcs.docs.map((d) => d.data()),
      products: prods.docs.map((d) => d.data()),
    }), { headers: NO_STORE });
  } catch (e) {
    console.error('[site] read failed:', String(e?.message || '').slice(0, 120));
    return NextResponse.json({ error: 'Could not load the page.' }, { status: 500, headers: NO_STORE });
  }
}
