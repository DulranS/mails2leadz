// lib/phone.js - one place that turns a phone number from a spreadsheet into dialable digits (no "+").
//
// A number written with a country code ("+44 ...", "0044 ...") is kept as it is. A local number that starts
// with 0 gets the DEFAULT country code, set with NEXT_PUBLIC_DEFAULT_COUNTRY_CODE (digits only, e.g. 94 for
// Sri Lanka, 44 for the UK, 1 for the US/Canada). The default is 94, so existing Sri Lankan data keeps working.
const DEFAULT_CC = String(process.env.NEXT_PUBLIC_DEFAULT_COUNTRY_CODE || '94').replace(/\D/g, '');

export function normalizePhone(raw, countryCode = DEFAULT_CC) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text || ['n/a', 'undefined', 'null'].includes(text.toLowerCase())) return null;

  const international = text.startsWith('+') || text.startsWith('00');
  let digits = text.replace(/\D/g, '');
  if (text.startsWith('00')) digits = digits.slice(2);

  if (!international && countryCode) {
    if (digits.startsWith('0') && digits.length >= 9) digits = countryCode + digits.slice(1);
    // Sri Lankan mobiles are often written without the leading 0 (7XXXXXXXX).
    else if (countryCode === '94' && digits.length === 9 && /^[7-9]/.test(digits)) digits = countryCode + digits;
  }
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null;
}
