import { groupNumber } from './format.js';
// lib/deck.js - a pitch deck as printable HTML slides (print to PDF from the browser). Pure: every figure comes from the owner's own data.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function deckSlides({ businessName = '', offer = '', idealCustomer = '', won = null, winRatePct = null, wonValue = null, pricePoint = null, averageContractValue = null } = {}) {
  const name = businessName || '[YOUR BUSINESS]';
  const traction = [];
  if (won !== null) traction.push(`Customers won in the last twelve months: ${won}`);
  if (winRatePct !== null) traction.push(`Win rate: ${winRatePct}%`);
  if (wonValue !== null) traction.push(`Value won in the last twelve months: ${groupNumber(wonValue)}`);
  const pricing = [];
  if (pricePoint !== null) pricing.push(`Typical price: ${groupNumber(pricePoint)}`);
  if (averageContractValue !== null) pricing.push(`Average contract value: ${groupNumber(averageContractValue)}`);
  return [
    { title: name, body: [offer || '[ONE SENTENCE ON WHAT YOU SELL]'] },
    { title: 'The problem', body: [idealCustomer ? `For ${idealCustomer}` : '[WHO HAS THE PROBLEM]', '[THE PROBLEM, IN THEIR WORDS]'] },
    { title: 'What we do', body: [offer || '[WHAT YOU DO]'] },
    { title: 'Traction', body: traction.length ? traction : ['[ADD YOUR FIGURES]'] },
    { title: 'Pricing', body: pricing.length ? pricing : ['[YOUR PRICES]'] },
    { title: 'The team', body: ['[WHO IS DOING THE WORK]'] },
    { title: 'The ask', body: ['[WHAT YOU NEED, AND WHAT IT WILL DO]'] },
  ];
}

export function deckHtml(slides, title = 'Pitch deck') {
  const pages = slides.map((s) => `<section class="slide"><h1>${esc(s.title)}</h1>${s.body.map((b) => `<p>${esc(b)}</p>`).join('')}</section>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { size: 297mm 210mm; margin: 0; }
body { margin: 0; font-family: system-ui, sans-serif; color: #111; }
.slide { width: 297mm; height: 210mm; box-sizing: border-box; padding: 22mm; page-break-after: always; display: flex; flex-direction: column; justify-content: center; }
.slide h1 { font-size: 40pt; margin: 0 0 8mm; }
.slide p { font-size: 20pt; line-height: 1.4; margin: 0 0 4mm; }
@media screen { .slide { border-bottom: 1px solid #ddd; } }
</style></head><body>
${pages}
<p style="font-size:9pt;color:#666;padding:6mm">Every figure came from the owner's own records. Anything in [square brackets] is yours to write.</p>
</body></html>`;
}
