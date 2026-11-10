// lib/journey-send.js - decides whether a due journey step may be sent automatically. Pure. The sender itself lives in lib/server/journey-send.js.
/** Automatic sending needs all of: the switch on, an email step, the person's agreement recorded, and no do-not-contact entry. */
export function autoSendDecision({ enrolment = {}, step = {}, suppressed = false, switchOn = false } = {}) {
  if (!switchOn) return { send: false, why: 'switch_off' };
  if (step.channel !== 'email') return { send: false, why: 'manual_channel' };
  if (!enrolment.consentConfirmedAt) return { send: false, why: 'no_agreement_recorded' };
  if (suppressed) return { send: false, why: 'do_not_contact' };
  return { send: true, why: 'ok' };
}

/** The message with an opt-out line added, so every automatic email can be stopped. */
export function withOptOut(text, optOutUrl = '') {
  const base = String(text || '').trim();
  return optOutUrl ? `${base}\n\nTo stop these messages, use this link: ${optOutUrl}` : `${base}\n\nTo stop these messages, reply STOP.`;
}
