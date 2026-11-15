// lib/balancr-inbox.js - how a Balancr lead becomes an AutoLeads inbox row. Pure (no database).
/** The fixed inbox id for one Balancr lead ('' when the lead has no usable id, so it cannot be recorded safely). */
export function balancrInboxId(uid, leadId) {
  const clean = String(leadId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120);
  return clean ? `balancr_${String(uid).replace(/[^A-Za-z0-9_-]/g, '')}_${clean}` : '';
}

/** The inbox row for one Balancr lead. A contact with an @ is an e-mail; anything else is a phone. */
export function balancrInboxRow(uid, lead, now = Date.now()) {
  const contact = String(lead.contact || '');
  return {
    userId: uid, name: String(lead.name || '').slice(0, 120), email: contact.includes('@') ? contact.toLowerCase() : '',
    phone: contact.includes('@') ? '' : contact, source: 'Balancr', status: 'new', receivedAt: new Date(now).toISOString(), balancrId: String(lead.id || ''),
  };
}
