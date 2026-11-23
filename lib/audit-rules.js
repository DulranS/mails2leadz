// lib/audit-rules.js - the business audit log: who sent a document or changed access, and when. Pure; no database.
// Entries are short and carry no secrets, no customer email addresses and no message text. Only the owner may read the log.
export const AUDIT_MAX_ENTRIES = 200;
export const AUDIT_ACTIONS = {
  'invoice.sent': 'Invoice emailed to the customer',
  'quote.sent': 'Quote emailed to the customer',
  'quote.followup_sent': 'Quote follow-up emailed',
  'team.invited': 'Team invite created',
  'team.invite_revoked': 'Team invite revoked',
  'team.role_changed': 'Team member role changed',
  'team.removed': 'Team member removed',
  'enquiry_key.rotated': 'Enquiry form key replaced (old links stop working)',
  'enquiry_key.revoked': 'Enquiry form key switched off',
  'assistant.applied': 'AI assistant change confirmed by the owner',
};

const clip = (v, n) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** One stored entry, or null when the action is unknown or nobody is named. Only these fields are ever kept. */
export function auditEntry({ action, actorUid, actorEmail = '', entityId = '', summary = '', at } = {}) {
  if (!Object.prototype.hasOwnProperty.call(AUDIT_ACTIONS, action)) return null;
  const uid = clip(actorUid, 128);
  if (!uid) return null;
  return {
    action,
    actorUid: uid,
    actorEmail: clip(actorEmail, 160),
    entityId: clip(entityId, 80),
    summary: clip(summary, 200),
    at: at || new Date().toISOString(),
  };
}

/** Newest first, known actions only, capped. Each row is ready to show. */
export function auditView(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && Object.prototype.hasOwnProperty.call(AUDIT_ACTIONS, r.action))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, AUDIT_MAX_ENTRIES)
    .map((r) => ({
      at: String(r.at || ''),
      label: AUDIT_ACTIONS[r.action],
      who: clip(r.actorEmail, 160) || clip(r.actorUid, 128),
      summary: clip(r.summary, 200),
      entityId: clip(r.entityId, 80),
    }));
}

/** Only the owner of the workspace reads the log. Team members act in it, but do not see it. */
export function canReadAudit(actor) {
  return !!actor && !!actor.uid && actor.uid === actor.tenantUid;
}
