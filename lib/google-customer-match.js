// lib/google-customer-match.js - Google Ads Customer Match: the request bodies, pure. The sender is lib/server/google-customer-match.js.
// Emails leave as SHA-256 hashes (lib/consent-guard.js) and only for customers with recorded consent.
import { consentedCustomers, hashEmail } from './consent-guard.js';

export const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v17';
export const GOOGLE_OAUTH_URL = 'https://oauth2.googleapis.com/token';
const BATCH = 1000;

/** Operations that add hashed emails to an offline user data job. Consented customers only; batches of 1000. */
export function customerMatchBatches(customers = []) {
  const ops = consentedCustomers(customers).map((c) => ({ create: { userIdentifiers: [{ hashedEmail: hashEmail(c.email) }] } }));
  const out = [];
  for (let i = 0; i < ops.length; i += BATCH) out.push(ops.slice(i, i + BATCH));
  return out;
}

export function userListBody(name = 'AutoLeads confirmed sign-ups') {
  return { operations: [{ create: { name, crmBasedUserList: { uploadKeyType: 'CONTACT_INFO', dataSourceType: 'FIRST_PARTY' }, membershipLifeSpan: 540 } }] };
}

export function customerMatchJobBody(userListResource) {
  return { job: { type: 'CUSTOMER_MATCH_USER_LIST', customerMatchUserListMetadata: { userList: userListResource } } };
}

export function adsHeaders(env, token) {
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN };
  if (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) h['login-customer-id'] = String(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID).replace(/-/g, '');
  return h;
}
