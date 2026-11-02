// lib/server/easypost.js - the EasyPost calls behind shipping labels: create a shipment (to get rates), buy the chosen rate (the label is
// paid from the owner's own EasyPost account), and read a tracker. The owner's key is used for every call. Errors never echo the
// provider's reply body, only its short message about the address or parcel, which is what the owner needs to fix.
const API = 'https://api.easypost.com/v2';

function authHeader(apiKey) {
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
}

async function call(apiKey, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method, headers: { Authorization: authHeader(apiKey), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(String(d?.error?.message || `EasyPost responded ${res.status}`).slice(0, 200));
    err.status = res.status;
    err.code = String(d?.error?.code || '').slice(0, 60);
    throw err;
  }
  return d;
}

export const createShipment = (apiKey, body) => call(apiKey, 'POST', '/shipments', body);
export const buyShipment = (apiKey, shipmentId, rateId) => call(apiKey, 'POST', `/shipments/${encodeURIComponent(shipmentId)}/buy`, { rate: { id: rateId } });
export const getTracker = (apiKey, trackerId) => call(apiKey, 'GET', `/trackers/${encodeURIComponent(trackerId)}`);
