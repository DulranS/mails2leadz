// lib/trust.js - a reliability score from what the owner can see: support targets met, complaints open, and money owed for too long. Pure. Shows how the score is made.
export function trustScore({ supportTargetMetPct = null, openComplaints = 0, creditRiskCount = 0 } = {}) {
  const parts = [];
  let score = 100;
  if (supportTargetMetPct !== null && supportTargetMetPct !== undefined) {
    const s = Math.max(0, Math.min(100, Number(supportTargetMetPct)));
    parts.push({ name: 'Support answered on time', value: `${Math.round(s)}%` });
    score -= (100 - s) * 0.4;
  }
  const complaints = Math.max(0, Math.floor(Number(openComplaints) || 0));
  if (complaints > 0) { parts.push({ name: 'Open complaints', value: String(complaints) }); score -= Math.min(30, complaints * 10); }
  const credit = Math.max(0, Math.floor(Number(creditRiskCount) || 0));
  if (credit > 0) { parts.push({ name: 'Customers owing over 30 days', value: String(credit) }); score -= Math.min(20, credit * 5); }
  const final = Math.round(Math.max(0, Math.min(100, score)));
  const label = final >= 80 ? 'Reliable' : final >= 60 ? 'Mostly reliable' : 'Needs attention';
  return { score: final, label, parts };
}
