// What the open pipeline is likely to be worth, not just what it is worth if everything closes.
//
// "Worth ~X if it all closes" is the best case. Multiplying by how often this business has actually won the leads it
// decided (won over won + lost, the lead conversion the app already shows) gives a figure the owner can plan around.
// One overall win rate is used on purpose: a rate per stage needs numbers the owner would have to invent. It is shown only
// once enough leads have been decided to mean something, and it says what it rests on. Read-only: no figure is changed.

export const MIN_DECIDED_FOR_EXPECTED = 5;

export interface ExpectedPipeline {
  bestCase: number; // sum of the open leads' estimated values
  expected: number; // best case x the win rate
  winRatePct: number; // the rate used, 0 to 100
  decided: number; // leads the rate rests on
}

export function expectedPipelineValue(
  openLeadValues: (number | null | undefined)[],
  winRatePct: number | null,
  decided: number,
  minDecided = MIN_DECIDED_FOR_EXPECTED
): ExpectedPipeline | null {
  if (winRatePct === null || !Number.isFinite(winRatePct) || winRatePct < 0 || winRatePct > 100) return null;
  if (!Number.isFinite(decided) || decided < minDecided) return null;
  let best = 0;
  for (const v of openLeadValues) if (typeof v === "number" && Number.isFinite(v) && v > 0) best += v;
  if (best <= 0) return null;
  return { bestCase: Math.round(best * 100) / 100, expected: Math.round(best * (winRatePct / 100) * 100) / 100, winRatePct: Math.round(winRatePct * 10) / 10, decided };
}
