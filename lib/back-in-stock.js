// lib/back-in-stock.js - "tell me when it is back" (pure). A customer who finds a sold-out item asks, once, to hear when it can be
// ordered again. The request is their own asking, and it gets one email, when the item is available. Nothing else is sent.
import { availableToSell, variantOf } from './products.js';

/** Who is waiting, for which product or option, and which of them are now orderable. Notified requests are skipped. */
export function planBackInStock({ waits = [], products = {} } = {}) {
  const out = [];
  for (const w of waits) {
    if (!w || w.notifiedAt) continue;
    const p = products[w.productId];
    if (!p || p.archived) continue;
    const opt = w.variantId ? variantOf(p, w.variantId) : null;
    if (w.variantId && !opt) continue;
    const avail = availableToSell(opt || p);
    if (avail !== null && avail <= 0) continue; // still sold out
    const name = `${p.name}${opt ? ` (${opt.label})` : ''}`;
    out.push({
      wait: w,
      name,
      draft: {
        subject: `${name} is back in stock`,
        body: [
          'Hello,', '',
          `${name} can be ordered again.`, '',
          'You asked to hear when it was back. Visit our page to order it.', '',
          'If you do not want this message, reply and say so, and we will not write about it again.',
        ].join('\n'),
      },
    });
  }
  return out;
}
