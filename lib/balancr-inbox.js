// lib/balancr-inbox.js - how a Balancr lead becomes an AutoLeads inbox row. Pure (no database).
import { splitContact } from './balancr.js';
/** The fixed inbox id for one Balancr lead ('' when the lead has no usable id, so it cannot be recorded safely). */
export function balancrInboxId(uid, leadId) {
  const clean = String(leadId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120);
  return clean ? `balancr_${String(uid).replace(/[^A-Za-z0-9_-]/g, '')}_${clean}` : '';
}

/** The inbox row for one Balancr lead. The contact is split into its e-mail and its phone, so "phone · email" keeps both. */
export function balancrInboxRow(uid, lead, now = Date.now()) {
  const { email, phone } = splitContact(lead.contact);
  return {
    userId: uid, name: String(lead.name || '').slice(0, 120), email, phone, source: 'Balancr', status: 'new',
    receivedAt: new Date(now).toISOString(), balancrId: String(lead.id || ''),
  };
}
