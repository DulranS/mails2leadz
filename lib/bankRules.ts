// Bank rules (v251): the repeated work of a statement, written down once. A rule says: when a line's description contains some text (and, optionally,
// the money is in or out), either ignore it (transfers between your own accounts, for example), or match it to the one ledger entry whose label fits and
// whose amount and date agree. A line with no rule, or with more than one entry that could be it, is left for a person. Rules never change the books;
// they only mark lines matched or ignored, and every such mark is stamped with who made it. Pure.

export type BankRuleAction = { kind: "ignore" } | { kind: "match"; label: string };
export interface BankRule { id: string; contains: string; direction: "in" | "out" | "any"; action: BankRuleAction }

export interface RuleLine { id: string; date: string; description: string; amount: number; status: string }
export interface RuleCandidate { id: string; date: string; label: string; amount: number }

export function validateRule(r: { contains: string; direction: string; action: BankRuleAction }): string | null {
  if (!r.contains || r.contains.trim().length < 3) return "The text to look for must be at least three letters.";
  if (!["in", "out", "any"].includes(r.direction)) return "Choose whether the money is in, out, or either.";
  if (r.action.kind === "match" && (!r.action.label || r.action.label.trim().length < 2)) return "Say which ledger entry this is, for example Rent.";
  return null;
}

const DAY = 86_400_000;

export function applyRules(lines: RuleLine[], rules: BankRule[], candidates: RuleCandidate[]) {
  const toIgnore: string[] = [];
  const toMatch: { lineId: string; note: string }[] = [];
  const review: string[] = [];
  const used = new Set<string>();
  for (const line of lines) {
    if (line.status !== "unmatched") continue;
    const text = line.description.toLowerCase();
    const rule = rules.find((r) =>
      text.includes(r.contains.trim().toLowerCase()) &&
      (r.direction === "any" || (r.direction === "in" ? line.amount > 0 : line.amount < 0))
    );
    if (!rule) continue;
    if (rule.action.kind === "ignore") {
      toIgnore.push(line.id);
      continue;
    }
    const want = rule.action.label.trim().toLowerCase();
    const lineTime = Date.parse(`${line.date}T00:00:00Z`);
    const fits = candidates.filter((c) =>
      !used.has(c.id) &&
      c.label.toLowerCase().includes(want) &&
      Math.abs(c.amount - line.amount) <= 1 &&
      Math.abs(Date.parse(`${c.date}T00:00:00Z`) - lineTime) <= 3 * DAY
    );
    if (fits.length === 1) {
      used.add(fits[0].id);
      toMatch.push({ lineId: line.id, note: `${fits[0].label} (matched by rule)` });
    } else {
      review.push(line.id);
    }
  }
  return { toIgnore, toMatch, review };
}
