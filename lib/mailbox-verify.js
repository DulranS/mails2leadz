// lib/mailbox-verify.js - what a mailbox verdict means for sending. Pure. The lookup itself is in lib/server/mailbox-verify.js.
// Hunter's verifier returns: valid, invalid, accept_all, webmail, disposable, unknown. Only "invalid" and "disposable" hold a
// send (they bounce or are throwaway). Everything else is sent as before: a verifier cannot be sure about accept-all or unknown.
export const HOLD_STATUSES = ['invalid', 'disposable'];

export function hunterVerdict(status) {
  return HOLD_STATUSES.includes(String(status || '').toLowerCase()) ? 'hold' : 'ok';
}
