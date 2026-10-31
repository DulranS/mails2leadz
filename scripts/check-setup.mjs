// scripts/check-setup.mjs - prints which connections are ready from the server settings (.env) and which keys are still missing.
// Usage: npm run setup:check. Prints names and states only, never a value.
import { integrationStatus } from '../lib/integrations.js';

const items = integrationStatus(process.env, { saas: false });
for (const i of items) {
  const state = i.state === 'ready' ? 'READY      ' : i.state === 'needs_keys' ? 'NEEDS KEYS ' : 'NOT BUILT  ';
  console.log(`${state} ${i.label}`);
  if (i.state === 'needs_keys') console.log(`             still needed: ${i.missing.join('; ')}`);
}
const ready = items.filter((i) => i.state === 'ready').length;
console.log(`\n${ready} of ${items.length} connections ready. Accounts in SaaS mode add their keys on the Integrations page instead.`);
