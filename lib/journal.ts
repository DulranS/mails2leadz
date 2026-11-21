// Double-entry journal (v271). Every entry is a set of lines, each a debit or a credit to one account, and an entry is accepted only when its debits equal its
// credits. The journal is built from the records the app already holds (see lib/journalFromRecords.ts): it does not change any stored figure. Pure.

export interface JLine { account: string; debit: number; credit: number }
export interface JEntry { id: string; date: string; memo: string; lines: JLine[] }

const r2 = (n: number) => Math.round(n * 100) / 100;

export function makeEntry(id: string, date: string, memo: string, lines: JLine[]): JEntry | { error: string } {
  const real = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(Date.parse(`${date}T00:00:00Z`)).toISOString().slice(0, 10) === date;
  if (!real) return { error: `Entry ${id} needs a real date.` };
  if (lines.length < 2) return { error: `Entry ${id} needs at least two lines.` };
  for (const l of lines) {
    if (!l.account.trim()) return { error: `Entry ${id} has a line with no account.` };
    if (l.debit < 0 || l.credit < 0) return { error: `Entry ${id} has a negative amount.` };
    if (l.debit > 0 && l.credit > 0) return { error: `Entry ${id} has a line that is both a debit and a credit.` };
  }
  const d = r2(lines.reduce((t, l) => t + l.debit, 0));
  const c = r2(lines.reduce((t, l) => t + l.credit, 0));
  if (Math.abs(d - c) > 0.005) return { error: `Entry ${id} does not balance: debits ${d}, credits ${c}.` };
  return { id, date, memo, lines: lines.filter((l) => l.debit > 0 || l.credit > 0) };
}

// The trial balance for a date range (v319): each account's debits and credits posted in the range, the totals, and the check that total
// debits equal total credits. Entries outside the range are left out. Pure.
export function journalTrialBalance(entries: JEntry[], from: string, to: string) {
  const byAccount = new Map<string, { debit: number; credit: number }>();
  let count = 0;
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    count++;
    for (const l of e.lines) {
      const row = byAccount.get(l.account) ?? { debit: 0, credit: 0 };
      row.debit = r2(row.debit + l.debit);
      row.credit = r2(row.credit + l.credit);
      byAccount.set(l.account, row);
    }
  }
  const rows = [...byAccount.entries()].map(([account, v]) => ({ account, debit: v.debit, credit: v.credit })).sort((a, b) => a.account.localeCompare(b.account));
  const debits = r2(rows.reduce((t, r) => t + r.debit, 0));
  const credits = r2(rows.reduce((t, r) => t + r.credit, 0));
  return { rows, debits, credits, entries: count, balanced: Math.abs(debits - credits) < 0.005 };
}

export function journalTotals(entries: JEntry[]) {
  const byAccount = new Map<string, number>();
  let debits = 0, credits = 0;
  for (const e of entries) for (const l of e.lines) {
    byAccount.set(l.account, r2((byAccount.get(l.account) ?? 0) + l.debit - l.credit));
    debits = r2(debits + l.debit);
    credits = r2(credits + l.credit);
  }
  return { balances: [...byAccount.entries()].map(([account, net]) => ({ account, net })).sort((a, b) => a.account.localeCompare(b.account)), debits, credits, balanced: Math.abs(debits - credits) < 0.005 };
}
