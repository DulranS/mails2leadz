/* AutoLeads website chat. Paste this on your site, once:
 *   <script src="https://YOUR-APP-ADDRESS/chat.js" data-key="YOUR-ENQUIRY-KEY" async></script>
 * Answers come only from your business description. Visitor messages are not stored. Contact details go to your enquiry inbox.
 * Everything is written as text (never as HTML), so nothing a visitor types can change the page. */
(function () {
  var script = document.currentScript || document.querySelector('script[data-key][src*="chat.js"]');
  if (!script) return;
  var key = script.getAttribute('data-key') || '';
  if (!key) return;
  var base;
  try { base = new URL(script.src).origin; } catch (e) { return; }
  var history = []; // kept in this page only; reloading the page clears it

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  var css = ''
    + '.ac-open{position:fixed;right:16px;bottom:16px;z-index:2147483000;min-height:44px;padding:0 18px;border:0;border-radius:999px;background:#0d9488;color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2)}'
    + '.ac-panel{position:fixed;right:16px;bottom:72px;z-index:2147483000;width:min(360px,calc(100vw - 32px));max-height:min(520px,calc(100vh - 110px));display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;background:#fff;color:#111827;border:1px solid #d1d5db;box-shadow:0 8px 28px rgba(0,0,0,.25);font:15px/1.45 system-ui,sans-serif}'
    + '.ac-panel[hidden]{display:none}'
    + '.ac-log{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;min-height:120px}'
    + '.ac-bot,.ac-you{margin:0;padding:8px 10px;border-radius:10px;max-width:88%;white-space:pre-wrap;word-wrap:break-word}'
    + '.ac-bot{background:#f3f4f6;align-self:flex-start}.ac-you{background:#ccfbf1;align-self:flex-end}'
    + '.ac-panel form{display:flex;flex-direction:column;gap:6px}'
    + '.ac-panel form[hidden]{display:none}'
    + '.ac-row{display:flex;gap:6px}'
    + '.ac-panel input{flex:1;min-height:44px;min-width:0;padding:8px 10px;border:1px solid #9ca3af;border-radius:8px;font:inherit;color:inherit;background:#fff}'
    + '.ac-panel button{min-height:44px;padding:0 14px;border:0;border-radius:8px;font:600 14px system-ui,sans-serif;cursor:pointer}'
    + '.ac-send,.ac-go{background:#0d9488;color:#fff}.ac-send:disabled{opacity:.5}'
    + '.ac-close{background:transparent;color:inherit;align-self:flex-end;min-height:32px;padding:0 6px;text-decoration:underline}'
    + '.ac-status{margin:0;font-size:13px;color:#374151}'
    + '@media (prefers-color-scheme: dark){.ac-panel{background:#111827;color:#f9fafb;border-color:#374151}.ac-bot{background:#1f2937}.ac-you{background:#134e4a}.ac-panel input{background:#1f2937;border-color:#6b7280}.ac-status{color:#d1d5db}}';
  var style = el('style');
  style.textContent = css;
  document.head.appendChild(style);

  var btn = el('button', 'ac-open', 'Chat with us');
  btn.type = 'button';
  btn.setAttribute('aria-expanded', 'false');

  var panel = el('section', 'ac-panel');
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Chat with us');
  var close = el('button', 'ac-close', 'Close');
  close.type = 'button';

  var log = el('div', 'ac-log');
  log.setAttribute('aria-live', 'polite');

  var ask = el('form', 'ac-ask');
  var question = el('input');
  question.type = 'text';
  question.placeholder = 'Ask a question';
  question.maxLength = 500;
  question.setAttribute('aria-label', 'Your question');
  var send = el('button', 'ac-send', 'Send');
  send.type = 'submit';
  var askRow = el('div', 'ac-row');
  askRow.appendChild(question);
  askRow.appendChild(send);
  ask.appendChild(askRow);

  var contact = el('form', 'ac-contact');
  contact.hidden = true;
  var status = el('p', 'ac-status', 'Leave your details and the team will reply.');
  var name = el('input'); name.placeholder = 'Your name'; name.required = true; name.maxLength = 120; name.autocomplete = 'name'; name.setAttribute('aria-label', 'Your name');
  var email = el('input'); email.type = 'email'; email.placeholder = 'Email'; email.required = true; email.maxLength = 160; email.autocomplete = 'email'; email.setAttribute('aria-label', 'Your email');
  var phone = el('input'); phone.type = 'tel'; phone.placeholder = 'Phone (optional)'; phone.maxLength = 40; phone.autocomplete = 'tel'; phone.setAttribute('aria-label', 'Your phone (optional)');
  var go = el('button', 'ac-go', 'Send my details');
  go.type = 'submit';
  contact.appendChild(status);
  contact.appendChild(name);
  contact.appendChild(email);
  contact.appendChild(phone);
  contact.appendChild(go);

  panel.appendChild(close);
  panel.appendChild(log);
  panel.appendChild(ask);
  panel.appendChild(contact);
  document.body.appendChild(btn);
  document.body.appendChild(panel);

  function line(who, text) {
    log.appendChild(el('p', who === 'you' ? 'ac-you' : 'ac-bot', text));
    log.scrollTop = log.scrollHeight;
  }
  function openPanel(v) {
    panel.hidden = !v;
    btn.setAttribute('aria-expanded', String(v));
    if (v) question.focus();
  }
  function showContact() {
    contact.hidden = false;
    name.focus();
  }

  btn.addEventListener('click', function () { openPanel(panel.hidden); });
  close.addEventListener('click', function () { openPanel(false); });
  line('bot', 'Hi! Ask me anything about us.');

  ask.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = question.value.trim();
    if (!msg) return;
    question.value = '';
    line('you', msg);
    send.disabled = true;
    fetch(base + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ k: key, message: msg, history: history.slice(-6) }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        var reply = j.reply || j.error || 'Sorry, something went wrong. Leave your details and the team will reply.';
        line('bot', reply);
        history.push({ role: 'visitor', text: msg });
        history.push({ role: 'assistant', text: reply });
        if (j.wants_contact) showContact();
      })
      .catch(function () {
        line('bot', 'Sorry, the chat is not reachable right now. Leave your details and the team will reply.');
        showContact();
      })
      .then(function () { send.disabled = false; question.focus(); });
  });

  contact.addEventListener('submit', function (e) {
    e.preventDefault();
    go.disabled = true;
    var last = history.length ? history[history.length - 2] : null;
    fetch(base + '/api/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        k: key,
        name: name.value.trim(),
        email: email.value.trim(),
        phone: phone.value.trim(),
        message: last && last.role === 'visitor' ? last.text : 'Asked for a call back (website chat)',
        src: 'chat',
      }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) {
          status.textContent = 'Thanks, we have your details and will reply.';
          contact.querySelectorAll('input').forEach(function (i) { i.disabled = true; });
          go.hidden = true;
        } else {
          status.textContent = res.j.error || 'Could not send your details. Please try again.';
          go.disabled = false;
        }
      })
      .catch(function () {
        status.textContent = 'Could not send your details right now. Please try again.';
        go.disabled = false;
      });
  });
})();
