// lib/go-live.js - a checklist from the facts the app already holds: what is connected, what is set, what is still a manual check. Pure. Reads presence only, never values.
export function goLiveChecklist(f = {}) {
  const items = [
    { id: 'google', area: 'Connections', label: 'Google connected (Search Console and Analytics)', status: f.googleConnected ? 'ready' : 'needs', action: 'Connect Google on Integrations.' },
    { id: 'ga4', area: 'Connections', label: 'Website traffic (GA4 property ID entered)', status: f.ga4PropertyId ? 'ready' : 'needs', action: 'Enter your GA4 property ID on Integrations, after reconnecting Google.' },
    { id: 'ai', area: 'Connections', label: 'AI key available (battle cards, replies, audits)', status: f.aiKey ? 'ready' : 'needs', action: 'Add an AI key on Integrations or the App keys page.' },
    { id: 'balancr', area: 'Connections', label: 'Balancr connected (leads, stages, invoices)', status: f.balancr ? 'ready' : 'optional', action: 'Enter the Balancr address, business ID, lead key and webhook token on Integrations.' },
    { id: 'twilio', area: 'Connections', label: 'Twilio connected (texts, missed calls)', status: f.twilio ? 'ready' : 'optional', action: 'Enter the account ID, auth token and sending number on Integrations.' },
    { id: 'places', area: 'Connections', label: 'Google Maps lead search key', status: f.places ? 'ready' : 'optional', action: 'Add the Places key on Integrations.' },
    { id: 'catalogue', area: 'Your content', label: 'Catalogue with products, services or packages', status: f.catalogueItems > 0 ? 'ready' : 'needs', action: 'Add your catalogue on the sales tools screen.' },
    { id: 'library', area: 'Your content', label: 'Answer library for automatic replies', status: f.libraryItems > 0 ? 'ready' : 'optional', action: 'Add question and answer lines on the support screen.' },
    { id: 'help', area: 'Your content', label: 'Help centre published', status: f.helpPublished ? 'ready' : 'optional', action: 'Publish it on the sales tools screen when your answers are ready.' },
    { id: 'routine', area: 'Your content', label: 'Routine messages: one owner chosen', status: f.routineChosen || f.balancr === false ? 'ready' : 'needs', action: 'Choose who sends booking and review messages on the sales tools screen.' },
    { id: 'dns', area: 'Email', label: 'Email records published (SPF, DKIM, DMARC) for your sending domain', status: f.dnsChecked ? 'ready' : 'needs', action: 'Publish the three records with your domain provider, then tick this.' },
    { id: 'unsubscribe', area: 'Email', label: 'One-click unsubscribe on marketing mail', status: 'ready', action: 'Built in. Send one test campaign to yourself and check the headers.' },
  ];
  const needs = items.filter((i) => i.status === 'needs').length;
  return { items, needs, ready: needs === 0, summary: needs === 0 ? 'Everything that is needed is in place.' : `${needs} item${needs === 1 ? '' : 's'} still need${needs === 1 ? 's' : ''} a step.` };
}
