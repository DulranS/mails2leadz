// lib/google-setup.js - the GA4 stream and the Google Ads purchase-conversion action, found from the owner's own Google account. Pure: the picks and the bodies.
export function pickWebStream(streams = []) {
  const s = (Array.isArray(streams) ? streams : []).find((x) => x && x.type === 'WEB_DATA_STREAM' && x.webStreamData?.measurementId);
  return s ? { measurementId: String(s.webStreamData.measurementId), streamName: String(s.name || '') } : null;
}

export function firstProperty(summaries = {}) {
  for (const a of summaries.accountSummaries || []) {
    const p = (a.propertySummaries || [])[0];
    if (p?.property) return String(p.property);
  }
  return null;
}

/** The purchase conversion AutoLeads reports to: an upload action, counted once per purchase. */
export function conversionActionBody(name = 'AutoLeads purchase') {
  return { operations: [{ create: { name: String(name).slice(0, 100), category: 'PURCHASE', type: 'UPLOAD_CLICKS', status: 'ENABLED', primaryForGoal: true, countingType: 'ONE_PER_CLICK', valueSettings: { defaultValue: 0, alwaysUseDefaultValue: false } } }] };
}
