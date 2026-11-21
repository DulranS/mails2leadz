// Re-importing a bank statement must not double the lines. A line is "the same" when its date, its description (ignoring case and
// extra spaces) and its amount to the cent all match. Matching is by count, not by yes/no: if the list already holds two identical
// same-day payments, a file with two of them adds nothing; a file with three adds only the one new copy. So two identical payments
// in a single first import both survive, as they should.
//
// Lines already on the list count whatever their status (unmatched, matched or ignored): a line someone has already reviewed is still
// on the statement, and importing it again must not put it back in front of them.

export interface StatementLineKeyable {
  date: string;
  description: string;
  amount: number;
}

export function statementLineKey(l: StatementLineKeyable): string {
  const desc = l.description.trim().replace(/\s+/g, " ").toLowerCase();
  const cents = Math.round(l.amount * 100);
  return `${l.date}|${desc}|${cents}`;
}

export interface ImportSplit<T> {
  fresh: T[]; // to add
  duplicates: T[]; // already on the list, skipped
}

export function splitNewStatementLines<T extends StatementLineKeyable>(incoming: T[], existing: StatementLineKeyable[]): ImportSplit<T> {
  const seen = new Map<string, number>();
  for (const e of existing) {
    const k = statementLineKey(e);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const fresh: T[] = [];
  const duplicates: T[] = [];
  for (const row of incoming) {
    const k = statementLineKey(row);
    const left = seen.get(k) ?? 0;
    if (left > 0) {
      seen.set(k, left - 1);
      duplicates.push(row);
    } else {
      fresh.push(row);
    }
  }
  return { fresh, duplicates };
}
