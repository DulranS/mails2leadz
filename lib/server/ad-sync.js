// lib/server/ad-sync.js - brings in the last three months of Meta and Google Ads spend for ONE account, using that account's keys.
// Used by the Integrations button and by the nightly routine. A source that is not connected is reported as not connected;
// a source that fails is reported with a plain message and never stops the other source.
import { collection, doc, getDocs, limit, query, setDoc } from '../server-firestore.js';
import { secretsFor, AD_NAMES } from './integration-secrets.js';
import { fetchMetaMonthly, fetchGoogleMonthly, planAdImport, IMPORT_SOURCES } from './ad-import.js';
import { recentMonths, MARKETING_LIMITS } from '../marketing.js';

const META = ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'];
const GOOGLE = ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID'];

/** @returns {Promise<{meta: null|{imported:string[],skipped:string[]}|{error:string}, google: same}>}  null = not connected */
export async function syncAdSpend(db, uid, { env = process.env, now = Date.now(), fetchImpl = fetch } = {}) {
  const sec = await secretsFor(db, uid, AD_NAMES, { env });
  const months = recentMonths(now, MARKETING_LIMITS.months); // newest first
  const since = `${months[months.length - 1]}-01`;
  const until = new Date(now).toISOString().slice(0, 10);
  const existing = (await getDocs(query(collection(db, 'users', uid, 'marketing_spend'), limit(MARKETING_LIMITS.entries))))
    .docs.map((d) => ({ id: d.id, ...d.data() }));

  const result = { meta: null, google: null };
  const run = async (source, connected, fetchRows) => {
    if (!connected) return;
    try {
      const rows = await fetchRows();
      const { writes, skipped } = planAdImport({ rows, existing, months, source });
      for (const w of writes) await setDoc(doc(db, 'users', uid, 'marketing_spend', w.id), { ...w, userId: uid, updatedAt: new Date().toISOString() });
      result[source] = { imported: writes.map((w) => w.month), skipped };
    } catch (e) {
      console.error(`[ad-sync ${source}]`, String(e?.message || '').slice(0, 120));
      result[source] = { error: `${IMPORT_SOURCES[source]} did not return the spend. Check the keys on the Integrations page, then try again.` };
    }
  };

  await run('meta', META.every((k) => sec[k]), () => fetchMetaMonthly({ token: sec.META_ACCESS_TOKEN, accountId: sec.META_AD_ACCOUNT_ID, since, until, fetchImpl }));
  await run('google', GOOGLE.every((k) => sec[k]), () => fetchGoogleMonthly({
    creds: { devToken: sec.GOOGLE_ADS_DEVELOPER_TOKEN, clientId: sec.GOOGLE_ADS_CLIENT_ID, clientSecret: sec.GOOGLE_ADS_CLIENT_SECRET, refreshToken: sec.GOOGLE_ADS_REFRESH_TOKEN, customerId: sec.GOOGLE_ADS_CUSTOMER_ID, loginCustomerId: sec.GOOGLE_ADS_LOGIN_CUSTOMER_ID },
    since, until, fetchImpl,
  }));
  return result;
}
