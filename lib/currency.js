// lib/currency.js - one place for how money is shown. The customer picks their currency in Account → Money settings;
// it is a DISPLAY choice (their deal values are typed in that currency). AI usage is billed by the AI provider in USD,
// so it is always shown as USD and converted with the customer's own "1 USD = ?" rate for ROI.

export const CURRENCIES = [
  ['USD', 'US dollar'], ['EUR', 'Euro'], ['GBP', 'British pound'], ['LKR', 'Sri Lankan rupee'], ['INR', 'Indian rupee'],
  ['AUD', 'Australian dollar'], ['CAD', 'Canadian dollar'], ['NZD', 'New Zealand dollar'], ['SGD', 'Singapore dollar'],
  ['AED', 'UAE dirham'], ['SAR', 'Saudi riyal'], ['PKR', 'Pakistani rupee'], ['BDT', 'Bangladeshi taka'],
  ['MYR', 'Malaysian ringgit'], ['PHP', 'Philippine peso'], ['ZAR', 'South African rand'], ['NGN', 'Nigerian naira'],
  ['KES', 'Kenyan shilling'], ['CHF', 'Swiss franc'], ['SEK', 'Swedish krona'], ['MXN', 'Mexican peso'], ['BRL', 'Brazilian real'],
];

export const normalizeCurrency = (code) => {
  const c = String(code || '').trim().toUpperCase();
  return CURRENCIES.some(([k]) => k === c) ? c : 'USD';
};

/** Rounded-to-whole-units formatter by default; pass decimals=2 for small amounts (cost per reply, AI spend). */
export function makeMoney(code, decimals = 0) {
  const currency = normalizeCurrency(code);
  let fmt;
  try {
    fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  } catch {
    fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  const f = decimals === 0 ? (n) => Math.round(Number(n) || 0) : (n) => Number(n) || 0;
  return (n) => fmt.format(f(n));
}

/** "$", "£", "Rs"... for input labels. */
export function currencySymbol(code) {
  try {
    const part = new Intl.NumberFormat('en-US', { style: 'currency', currency: normalizeCurrency(code), currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency');
    return part ? part.value : normalizeCurrency(code);
  } catch {
    return normalizeCurrency(code);
  }
}

// ---- Approximate amounts in other currencies (Pass 132) ----
// The invoice, the payment and the books stay in the business currency. The owner may type a few indicative rates
// ("EUR 0.92" = how many euros for 1 unit of the business currency), and invoice emails and reminders then show the
// approximate amount in those currencies. The app never fetches rates and never charges or books in another currency.
export const FX_DISPLAY_MAX = 5;

const fmtNum = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

/**
 * Parses "EUR 0.92, GBP 0.79" (or [{code, rate}]) into the list the owner saved.
 * Drops the business currency itself, unknown codes, repeated codes, and rates that are not positive numbers.
 * Keeps at most FX_DISPLAY_MAX entries.
 */
export function sanitizeFxDisplay(input, base) {
  const b = normalizeCurrency(base);
  const items = Array.isArray(input) ? input : String(input || '').split(/[,;\n]+/);
  const out = [];
  const seen = new Set();
  for (const it of items) {
    let code;
    let rate;
    if (it && typeof it === 'object') { code = it.code; rate = it.rate; }
    else {
      const m = String(it || '').trim().match(/^([A-Za-z]{3})\s*[=:]?\s*(\d+(?:\.\d+)?)$/);
      if (!m) continue;
      code = m[1];
      rate = m[2];
    }
    const c = String(code || '').trim().toUpperCase();
    const r = Number(rate);
    if (!CURRENCIES.some(([k]) => k === c) || c === b || seen.has(c)) continue;
    if (!Number.isFinite(r) || r <= 0 || r > 1e6) continue;
    seen.add(c);
    out.push({ code: c, rate: r });
    if (out.length >= FX_DISPLAY_MAX) break;
  }
  return out;
}

/** "EUR 92.00 or GBP 79.00" for an amount in the business currency, or '' when no rates are saved. */
export function approxList(amount, fx) {
  const list = Array.isArray(fx) ? fx : [];
  const a = Number(amount) || 0;
  return list
    .filter((x) => x && Number(x.rate) > 0)
    .map(({ code, rate }) => `${code} ${fmtNum(Math.round(a * rate * 100) / 100)}`)
    .join(' or ');
}

/** One plain sentence for an email, or '' when no rates are saved. Says the figures are indicative and the payment is not in those currencies. */
export function approxSentence({ amount, base, fx, asOf = '' }) {
  const list = approxList(amount, fx);
  if (!list) return '';
  const day = /^\d{4}-\d{2}-\d{2}/.test(String(asOf)) ? ` (rates set on ${String(asOf).slice(0, 10)})` : '';
  return `About ${list} at the business's own indicative rates${day}. Payment is in ${normalizeCurrency(base)} only; your bank sets the exact amount in your currency.`;
}

/** For an invoice charged in another currency: the amount is fixed at the rate on the invoice. Plain, factual, no promise about the bank's conversion. */
export function fixedRateSentence({ base, charge, rate, asOf = '' }) {
  const day = /^\d{4}-\d{2}-\d{2}/.test(String(asOf)) ? ` on ${String(asOf).slice(0, 10)}` : '';
  const r = Math.round(Number(rate) * 1e6) / 1e6;
  return `The ${charge} amount includes any tax and was fixed${day} at 1 ${normalizeCurrency(base)} = ${r} ${charge}. Payment is in ${charge}; your bank may add its own conversion charge.`;
}

// ---- Charging a sale in another currency (Pass 134) ----
/** The currency and fixed rate for one sale, from the owner's saved rates. Blank or the business currency means no conversion. */
export function chargeTerms(settings, wanted) {
  const base = normalizeCurrency(settings?.currency);
  const code = String(wanted || '').trim().toUpperCase();
  if (!code || code === base) return { chargeCurrency: '', fxRate: 0 };
  const hit = sanitizeFxDisplay(settings?.fxDisplay, base).find((x) => x.code === code);
  if (!hit) return { error: `${code} is not offered for this business. Add its rate on the Account page first.` };
  return { chargeCurrency: hit.code, fxRate: hit.rate };
}

/** What a customer may choose: the business currency first (rate 1), then the owner's saved rates. */
export function offeredCurrencies(settings) {
  const base = normalizeCurrency(settings?.currency);
  return [{ code: base, rate: 1 }, ...sanitizeFxDisplay(settings?.fxDisplay, base)];
}

/** How a quote's amounts are shown to the customer: converted at the quote's fixed rate when it is charged in another currency. */
export function quoteDisplay(quote) {
  const rate = Number(quote?.fxRate);
  if (quote?.chargeCurrency && rate > 0) {
    return { cur: quote.chargeCurrency, conv: (n) => Math.round((Number(n) || 0) * rate * 100) / 100 };
  }
  return { cur: quote?.currency || '', conv: (n) => Number(n) || 0 };
}
