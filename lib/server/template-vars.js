// lib/server/template-vars.js - fills {{placeholders}} in an email subject/body. Used by BOTH send routes, so a template
// behaves the same in the first email and in follow-ups. Replaces every occurrence, tolerates spaces/case
// ({{ First Name }}, {{business_name}}), and leaves unknown placeholders untouched.

const norm = (name) => String(name || '').toLowerCase().replace(/[\s_-]+/g, '');

export function fillTemplate(text, { firstName = '', lastName = '', businessName = '', senderName = '' } = {}) {
  if (!text) return '';
  return String(text).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name) => {
    const k = norm(name);
    if (k === 'sendername' || k === 'sender' || k === 'yourname') return senderName || '';
    if (k === 'firstname') return firstName || '';
    if (k === 'lastname') return lastName || '';
    if (k === 'company' || k === 'business' || k === 'businessname' || k === 'companyname') return businessName || '';
    return match;
  });
}

/**
 * The dashboard maps `sender_name` to the literal value "sender_name", meaning "use the name typed under Your Info".
 * Anything else is a CSV column holding a per-row name. Returns the display name for one row.
 */
export function resolveSenderName({ mappedTo, rowValues = {}, typedName = '' }) {
  const mapped = String(mappedTo || '').trim();
  if (mapped && mapped !== 'sender_name' && Object.prototype.hasOwnProperty.call(rowValues, mapped) && String(rowValues[mapped] || '').trim()) {
    return String(rowValues[mapped]).trim();
  }
  return String(typedName || '').trim();
}
