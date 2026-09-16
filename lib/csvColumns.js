/**
 * lib/csvColumns.js
 * ------------------
 * Real-world spreadsheets never use the exact column names a schema wants
 * — "Company", "Business Name", "E-mail", "Phone Number", "WhatsApp" all
 * mean the same thing to a human. The import route used to require an
 * exact `email` header and threw out the *entire row* if it didn't find
 * one — which is why a CSV exported from Google Sheets, a CRM, or a
 * Maps/directory list could come back "100% invalid" even though the data
 * was perfectly fine: the header just wasn't spelled the one exact way
 * the code expected.
 *
 * This maps common header variants onto the canonical lead fields the
 * app actually uses, so import works with however a real spreadsheet
 * happens to name its columns — no more silent all-or-nothing failures.
 */

const CANONICAL_FIELDS = ['email', 'phone', 'full_name', 'company_name', 'title', 'website'];

const ALIASES = {
  email: ['email', 'emailaddress', 'email1', 'contactemail', 'workemail', 'businessemail'],
  phone: [
    'phone', 'phonenumber', 'phone1', 'mobile', 'mobilenumber', 'whatsapp', 'whatsappnumber',
    'contactnumber', 'tel', 'telephone', 'cell', 'cellphone', 'businessphone',
  ],
  full_name: ['fullname', 'name', 'contactname', 'contact', 'person', 'contactperson'],
  company_name: [
    'companyname', 'company', 'businessname', 'business', 'organization', 'organisation',
    'org', 'accountname',
  ],
  title: ['title', 'jobtitle', 'role', 'position', 'designation'],
  website: ['website', 'url', 'site', 'web', 'domain', 'webaddress', 'homepage'],
};

// Flat reverse lookup: normalized alias -> canonical field.
const ALIAS_TO_FIELD = {};
for (const field of CANONICAL_FIELDS) {
  for (const alias of ALIASES[field]) ALIAS_TO_FIELD[alias] = field;
}

function normalizeKey(key) {
  return (key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Remaps one parsed CSV row onto canonical field names, regardless of the
 * original header spelling/casing/punctuation. Columns that don't match
 * any known field are kept under their original header in `unmapped` so
 * they can still be folded into research_notes instead of silently
 * dropped — a business/city/rating column, for example.
 */
function mapRowToLead(row) {
  const mapped = {};
  const unmapped = {};
  for (const [key, value] of Object.entries(row)) {
    const canonical = ALIAS_TO_FIELD[normalizeKey(key)];
    if (canonical) {
      // First non-empty match for a canonical field wins, in case a CSV
      // has more than one column that maps to the same field.
      if (!mapped[canonical] && value) mapped[canonical] = value;
    } else if (value) {
      unmapped[key] = value;
    }
  }
  return { mapped, unmapped };
}

/** Strips a UTF-8 BOM some spreadsheet exports (Excel especially) prepend. */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

module.exports = { mapRowToLead, stripBom, CANONICAL_FIELDS };
