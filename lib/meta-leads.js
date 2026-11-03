// lib/meta-leads.js - Meta (Facebook / Instagram) Lead Ads, pure helpers: verify the signature, read the lead events, map the form.
// The route does the Graph API call and stores the leads as "new" in the inbox. Nothing is sent to the lead.
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Meta signs each POST body with the app secret: header "sha256=<hex>". Compared in constant time. */
export function verifyMetaSignature(rawBody, header, appSecret) {
  if (!appSecret || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody)).digest('hex');
  const got = header.slice(7);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** The leadgen events in a webhook payload: [{ leadgenId, pageId, formId }]. */
export function leadgenEvents(payload) {
  const out = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const ch of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (ch?.field !== 'leadgen' || !ch.value?.leadgen_id) continue;
      out.push({ leadgenId: String(ch.value.leadgen_id), pageId: String(ch.value.page_id || entry.id || ''), formId: String(ch.value.form_id || '') });
    }
  }
  return out;
}

/** Maps the form's field_data to the inbox lead. Null when there is no email (the inbox needs one). */
export function leadFromFields(fieldData, { formId = '' } = {}) {
  const get = (name) => {
    const f = (Array.isArray(fieldData) ? fieldData : []).find((x) => String(x?.name || '').toLowerCase() === name);
    return f && Array.isArray(f.values) ? String(f.values[0] || '') : '';
  };
  const email = get('email').trim();
  if (!email) return null;
  const full = get('full_name').trim().split(/\s+/);
  return {
    email,
    first_name: get('first_name') || full[0] || '',
    last_name: get('last_name') || (full.length > 1 ? full.slice(1).join(' ') : ''),
    phone_primary: get('phone_number'),
    business_name: get('company_name'),
    campaign: formId ? `meta-lead-form ${formId}` : 'meta-lead-form',
  };
}
