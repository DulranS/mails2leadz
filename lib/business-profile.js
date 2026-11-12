// lib/business-profile.js - one way to read the business details the owner enters on the Account page. Pure.
// The Account page stores them under settings/business.profile; older or direct settings are used when a field is not there.
export function resolveProfile(biz = {}) {
  const p = (biz && biz.profile) || {};
  return {
    businessName: String(p.businessName || biz.businessName || '').slice(0, 160),
    offer: String(p.offer || biz.offer || '').slice(0, 400),
    idealCustomer: String(biz.idealCustomer || p.audience || '').slice(0, 400),
    valueProp: String(p.valueProp || '').slice(0, 300),
  };
}
