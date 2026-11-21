// Recurring transaction automation
import type { Expense, Recurrence } from "./types";

export interface RecurringTransaction {
  id: string;
  name: string;
  amount: number;
  category: string;
  kind: "expense" | "revenue";
  recurrence: Recurrence;
  startDate: string;
  endDate?: string;
  lastGeneratedDate?: string;
  nextDueDate: string;
}

export interface GeneratedTransaction {
  originalRecurringId: string;
  name: string;
  amount: number;
  category: string;
  kind: "expense" | "revenue";
  date: string;
}

/**
 * Calculate the next due date for a recurring transaction.
 *
 * Pure calendar arithmetic on the YYYY-MM-DD text (no local-time Date maths, so
 * it gives the same answer in Colombo, UTC or New York). A month that is too
 * short clamps to its last day instead of spilling into the next month:
 * 31 Jan + 1 month = 28 Feb (not 3 Mar, which used to skip February entirely
 * and then bill on the 3rd forever). Pass `anchorDay` (the day of the month the
 * schedule started on) so a 31st-of-the-month schedule returns to the 31st
 * after a short month (28 Feb -> 31 Mar) instead of staying on the 28th.
 */
export function calculateNextDueDate(
  recurrence: Recurrence,
  lastDate: string,
  anchorDay?: number
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(lastDate);
  if (!m) return lastDate;
  const y = Number(m[1]);
  const mo = Number(m[2]); // 1-12
  const d = Number(m[3]);
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  const wanted = anchorDay && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : d;
  const clampedIn = (year: number, month1: number) => {
    const dim = new Date(Date.UTC(year, month1, 0)).getUTCDate(); // days in month1 (1-12)
    return iso(new Date(Date.UTC(year, month1 - 1, Math.min(wanted, dim))));
  };

  switch (recurrence) {
    case "weekly":
      return iso(new Date(Date.UTC(y, mo - 1, d + 7)));
    case "monthly":
      return mo === 12 ? clampedIn(y + 1, 1) : clampedIn(y, mo + 1);
    case "yearly":
      return clampedIn(y + 1, mo);
    default:
      return lastDate;
  }
}

/** Day of the month (1-31) of a YYYY-MM-DD string, or undefined if it isn't one. */
export function dayOfMonthOf(iso: string | undefined): number | undefined {
  const m = iso ? /^\d{4}-\d{2}-(\d{2})/.exec(iso) : null;
  return m ? Number(m[1]) : undefined;
}

/**
 * Generate transactions that are due for a given date range
 */
export function generateDueTransactions(
  recurringTransactions: RecurringTransaction[],
  startDate: string,
  endDate: string
): GeneratedTransaction[] {
  const generated: GeneratedTransaction[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (const rt of recurringTransactions) {
    // Skip if ended before start date
    if (rt.endDate && rt.endDate < startDate) continue;
    
    // Skip if recurrence is none
    if (rt.recurrence === "none") continue;

    let currentDate = new Date(rt.lastGeneratedDate || rt.startDate);
    
    // Advance to first date within range
    while (currentDate < start) {
      currentDate = new Date(calculateNextDueDate(rt.recurrence, currentDate.toISOString().split('T')[0]));
    }

    // Generate all occurrences within range
    while (currentDate <= end) {
      if (rt.endDate && currentDate > new Date(rt.endDate)) break;

      generated.push({
        originalRecurringId: rt.id,
        name: rt.name,
        amount: rt.amount,
        category: rt.category,
        kind: rt.kind,
        date: currentDate.toISOString().split('T')[0],
      });

      currentDate = new Date(calculateNextDueDate(rt.recurrence, currentDate.toISOString().split('T')[0]));
    }
  }

  return generated;
}

/**
 * Convert Expense to RecurringTransaction format
 */
export function expenseToRecurring(expense: Expense): RecurringTransaction {
  return {
    id: expense.id,
    name: expense.name,
    amount: expense.amount,
    category: expense.category,
    kind: expense.kind,
    recurrence: expense.recurrence,
    startDate: expense.startDate,
    endDate: expense.endDate,
    lastGeneratedDate: expense.startDate, // Assume generated on start date initially
    nextDueDate: calculateNextDueDate(expense.recurrence, expense.startDate),
  };
}

/**
 * Generate and save recurring transactions to Firestore
 */
export async function generateAndSaveRecurringTransactions(
  db: any,
  businessId: string,
  recurringTransactions: RecurringTransaction[],
  targetDate: string
): Promise<{ generated: number; errors: string[] }> {
  const generated: GeneratedTransaction[] = generateDueTransactions(
    recurringTransactions,
    targetDate,
    targetDate
  );

  const batch = db.batch();
  let count = 0;
  const errors: string[] = [];

  for (const gt of generated) {
    try {
      const ref = db.collection(`users/${businessId}/expenses`).doc();
      batch.set(ref, {
        name: gt.name,
        amount: gt.amount,
        category: gt.category,
        kind: gt.kind,
        isRecurring: false, // Generated instance is not recurring itself
        recurrence: "none",
        startDate: gt.date,
        createdAt: Date.now(),
      });
      count++;

      // Update lastGeneratedDate for the recurring transaction
      const rtRef = db.doc(`users/${businessId}/expenses/${gt.originalRecurringId}`);
      batch.update(rtRef, { lastGeneratedDate: gt.date });
    } catch (err) {
      errors.push(`Failed to generate ${gt.name}: ${err}`);
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  return { generated: count, errors };
}
