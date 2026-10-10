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
