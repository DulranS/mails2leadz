// lib/esign.js - the agreement as a document to sign: signature and date fields placed by text tags, and the form Dropbox Sign expects. Pure.
// Dropbox Sign: POST https://api.hellosign.com/v3/signature_request/send with the API key as the basic-auth user; text tags are read when use_text_tags=1.
export const DROPBOX_SIGN = 'https://api.hellosign.com/v3';

/** The agreement text with a signature block at the end, placed by text tags for the first signer. */
export function withSignatureBlock(text, signerName = '') {
  const who = String(signerName || 'Signer').slice(0, 80);
  return `${String(text).trim()}\n\nSigned by: ${who}\n\nSignature: [sig|req|signer1]\n\nDate: [date|req|signer1]\n`;
}

/** The fields Dropbox Sign needs, as [name, value] pairs, without the file. */
export function signatureRequestFields({ title, signerEmail, signerName, message = '', testMode = false }) {
  return [
    ['title', String(title || 'Agreement').slice(0, 255)],
    ['subject', `Please sign: ${String(title || 'Agreement').slice(0, 200)}`],
    ['message', String(message || 'Please review and sign this agreement.').slice(0, 1000)],
    ['signers[0][email_address]', String(signerEmail)],
    ['signers[0][name]', String(signerName || 'Signer').slice(0, 120)],
    ['test_mode', testMode ? '1' : '0'],
    ['use_text_tags', '1'],
  ];
}

/** Whether a Dropbox Sign status reply says the request is complete (every signer has signed). */
export function isComplete(json) {
  return json?.signature_request?.is_complete === true;
}
