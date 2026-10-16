// lib/onboarding.js - "what should a new account do first?", worked out from what they have actually done. Pure; no network.
// A new customer who reaches their first sent email and first reply keeps using the product; one who stalls at setup churns.
// So the steps are ordered by what unlocks value, and each says where to go. Optional steps never block "done".

export function computeOnboarding(f = {}) {
  const steps = [
    { id: 'profile', done: !!f.profile, optional: false, label: 'Tell the AI what you sell', help: 'Your offer and who you help. Every draft is written from this.', href: '/account' },
    { id: 'leads', done: !!f.leads, optional: false, label: 'Get your first leads', help: 'Upload a list, or let the lead finder fill your Lead Inbox.', href: '/inbox' },
    { id: 'send', done: !!f.sent, optional: false, label: 'Send your first email', help: 'Draft with AI, read it, press Send. You approve every email.', href: '/dashboard' },
    { id: 'enquiry', done: !!f.enquiryLink, optional: true, label: 'Create your enquiry link', help: 'So people can contact you from your bio, a QR code or your website.', href: '/account' },
    { id: 'kit', done: !!f.kit, optional: true, label: 'Add your booking link and real results', help: 'Makes replies likelier: an easy next step and proof you can stand behind.', href: '/account' },
    { id: 'reply', done: !!f.replied, optional: false, label: 'Get your first reply', help: 'Replies are found for you; keep going until one arrives.', href: '/dashboard' },
    { id: 'win', done: !!f.won, optional: false, label: 'Win your first deal', help: 'Move it to Won in the pipeline and see what it was worth.', href: '/crm' },
  ];
  const required = steps.filter((s) => !s.optional);
  const doneRequired = required.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done && !s.optional) || steps.find((s) => !s.done) || null;
  return {
    steps,
    doneCount: steps.filter((s) => s.done).length,
    total: steps.length,
    percent: Math.round((doneRequired / required.length) * 100), // optional steps do not hold the bar back
    complete: doneRequired === required.length,
    next,
  };
}
