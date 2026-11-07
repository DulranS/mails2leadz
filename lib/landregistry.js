// lib/landregistry.js - UK sold prices (HM Land Registry Price Paid Data) for a postcode, as comparables. Pure: the query and the reading.
// Open data, no key. The predicates follow the Price Paid Data linked-data model as known at writing; verify them against the live endpoint.
export const LR_ENDPOINT = 'https://landregistry.data.gov.uk/landregistry/query';
const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;

export function normalisePostcode(raw) {
  const p = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!UK_POSTCODE.test(p)) return null;
  return `${p.slice(0, -3)} ${p.slice(-3)}`;
}

export function soldPricesQuery(postcode) {
  const pc = normalisePostcode(postcode);
  if (!pc) return null;
  return `PREFIX ppd: <http://landregistry.data.gov.uk/def/ppi/>
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
SELECT ?price ?date ?paon WHERE {
  ?t ppd:pricePaid ?price ; ppd:transactionDate ?date ; ppd:propertyAddress ?a .
  ?a lrcommon:postcode "${pc}" .
  OPTIONAL { ?a lrcommon:paon ?paon }
} ORDER BY DESC(?date) LIMIT 50`;
}

/** The sold prices from a SPARQL JSON reply, as comparables. Bad rows are dropped. */
export function parseSoldPrices(json) {
  const rows = json?.results?.bindings || [];
  return rows.map((r) => ({
    price: Number(r.price?.value),
    date: String(r.date?.value || '').slice(0, 10),
    description: String(r.paon?.value || '').slice(0, 120),
  })).filter((c) => c.price > 0);
}
