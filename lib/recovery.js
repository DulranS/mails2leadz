// lib/recovery.js - contact recovery: a second chance for good businesses whose website shows no email (pure, no network).
// The lead finder reads each business's website. A business that scores well but shows no email, phone or WhatsApp is dropped
// today and never looked at again. Recovery queues its domain, and a nightly lookup through the owner's own contact-lookup key
// (Hunter) looks for a named, confident contact at that domain. Only a contact at or above the confidence bar becomes a lead.
export const RECOVERY_MIN_CONFIDENCE = 70; // Hunter's own confidence score, 0-100
export const RECOVERY_PER_NIGHT = 20;      // domains looked up per owner per night, so credits stay bounded

/** The domain of a business website, lower case, without www. '' when there is none or it is not a usable domain. */
export function domainOf(website) {
  try {
    const host = new URL(String(website || '').trim()).hostname.toLowerCase().replace(/^www\./, '');
    return /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) ? host : '';
  } catch { return ''; }
}

/**
 * The finder rows worth a second look: a usable website, no way to reach the business already (no email, no phone, no WhatsApp),
 * the site was read (or could not be read), and the score is at least the minimum. `readyIds` are rows already sent to the inbox.
 */
export function recoverableRows(rows = [], readyIds = new Set(), minScore = 0) {
  const out = [];
  for (const r of rows) {
    if (!r || readyIds.has(r.place_id)) continue;
    if (r.email || r.email_primary || r.whatsapp_number || r.phone_primary) continue;
    if (!['no_contact_on_site', 'unreachable'].includes(r.enrich_status)) continue;
    const domain = domainOf(r.website);
    if (!domain) continue;
    const score = Number(r.lead_quality_score) || 0;
    if (score < minScore) continue;
    out.push({
      domain, score, place_id: String(r.place_id || '').slice(0, 200), business_name: String(r.business_name || '').slice(0, 160),
      website: String(r.website || '').slice(0, 300), category: String(r.category || '').slice(0, 100),
      campaign: String(r.campaign || '').slice(0, 80), lead_quality: String(r.lead_quality || 'WARM').slice(0, 8),
    });
  }
  return out;
}

/** The best contact a lookup returned: confident enough, with an address. null when none qualifies. */
export function pickHunterContact(contacts = [], min = RECOVERY_MIN_CONFIDENCE) {
  const ok = (Array.isArray(contacts) ? contacts : []).filter((c) => c && c.email && Number(c.confidence) >= min);
  if (!ok.length) return null;
  // A named person beats a bare address when confidence is close; the list is already sorted by confidence.
  ok.sort((a, b) => (Number(b.confidence) + (b.name ? 5 : 0)) - (Number(a.confidence) + (a.name ? 5 : 0)));
  return ok[0];
}

/** A lead for the inbox, built from a queued business and the contact found at its domain. Field names follow lib/lead-inbox.js. */
export function leadFromRecovery(item, contact) {
  const parts = String(contact.name || '').trim().split(/\s+/);
  return {
    email: contact.email,
    business_name: item.business_name,
    website: item.website,
    place_id: item.place_id,
    category: item.category,
    campaign: item.campaign || 'Contact recovery',
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' '),
    decision_maker_name: contact.name || '',
    decision_maker_title: contact.position || '',
    email_primary: contact.email,
    all_emails: contact.email,
    contact_confidence: String(Math.round(Number(contact.confidence) || 0)),
    best_contact_method: 'email',
    lead_quality: item.lead_quality,
    lead_quality_score: String(Math.round(Number(item.score) || 0)),
  };
}
