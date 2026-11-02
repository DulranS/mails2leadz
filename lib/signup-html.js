// lib/signup-html.js - the hosted sign-up form, the thank-you page, and the confirmation page. Pure: returns HTML text.
// Values are escaped and the pages run no scripts. The form posts to this site and nowhere else.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shell = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;color:#111827;background:#f9fafb;margin:0;padding:24px}main{max-width:480px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px}h1{font-size:20px;margin:0 0 12px}label{display:block;margin-top:12px;font-size:14px}input[type=text],input[type=email]{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:15px;margin-top:4px}.check{display:flex;gap:8px;align-items:flex-start;font-size:14px}button{margin-top:16px;width:100%;padding:12px;border:0;border-radius:8px;background:#4338ca;color:#fff;font-size:15px;font-weight:600}.muted{color:#6b7280;font-size:12px;margin-top:12px}.err{color:#b91c1c;font-size:14px}.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}</style></head><body><main>${body}</main></body></html>`;

export function renderSignupForm({ businessName = '', action = '', consentText = '', error = '' } = {}) {
  return shell('Join our mailing list', `<h1>Join ${esc(businessName || 'our')} mailing list</h1>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
<form method="post" action="${esc(action)}">
<label>Email <input type="email" name="email" required autocomplete="email" maxlength="254"></label>
<label>Name (optional) <input type="text" name="name" autocomplete="name" maxlength="80"></label>
<label class="check"><input type="checkbox" name="consent" value="yes" required> <span>${esc(consentText)}</span></label>
<div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
<button type="submit">Sign me up</button>
</form>
<p class="muted">We will email you a link to confirm. Nothing is sent until you confirm.</p>`);
}

export function renderThanks(text) {
  return shell('Thank you', `<h1>Thank you</h1><p>${esc(text)}</p>`);
}

export function renderConfirmPage({ businessName = '', action = '', token = '' } = {}) {
  return shell('Confirm your sign-up', `<h1>Confirm your sign-up</h1>
<p>Press the button to confirm you want to receive emails from ${esc(businessName || 'this business')}.</p>
<form method="post" action="${esc(action)}"><input type="hidden" name="t" value="${esc(token)}"><button type="submit">Yes, confirm</button></form>`);
}
