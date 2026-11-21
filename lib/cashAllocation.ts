// Cash allocation (v192b): what the bank balance is for. Committed money (bills and payables due, loan installments, pay, recurring
// costs, rent) comes out first; then the operating reserve, held back for bad months; what is left is discretionary and can be spent
// on something chosen. Weekly rhythm turns the day-by-day runway into weeks so a gap shows before it becomes a crisis. Pure.
export const RESERVE_MONTHS_DEFAULT = 3;

export interface CashAllocation {
  cash: number;
  committed: number; // owed in the window before anything else
  reserveTarget: number; // operating reserve the owner chose to keep
  reserve: number; // how much of the reserve the cash after commitments actually covers
  discretionary: number; // what is free to spend on a chosen thing
  shortfall: number; // committed money the balance cannot cover (0 when covered)
  reserveGap: number; // how far the reserve falls short of its target (0 when met)
}

export function allocateCash(input: { cash: number; committed: number; reserveMonths: number; monthlyCommitted: number }): CashAllocation {
  const cash = Math.round(input.cash * 100) / 100;
  const committed = Math.round(Math.max(0, input.committed) * 100) / 100;
  const reserveTarget = Math.round(Math.max(0, input.reserveMonths) * Math.max(0, input.monthlyCommitted) * 100) / 100;
  const afterCommitted = cash - committed;
  const reserve = Math.max(0, Math.min(reserveTarget, afterCommitted));
  return {
    cash,
    committed,
    reserveTarget,
    reserve: Math.round(reserve * 100) / 100,
    discretionary: Math.round(Math.max(0, afterCommitted - reserveTarget) * 100) / 100,
    shortfall: Math.round(Math.max(0, committed - cash) * 100) / 100,
    reserveGap: Math.round(Math.max(0, reserveTarget - Math.max(0, afterCommitted)) * 100) / 100,
  };
}

// The runway grouped into weeks of seven days from the first day, flagging any week whose closing balance is below the reserve target.
export function weeklyRhythm(days: { date: string; inflow: number; outflow: number; committed: number; balance: number }[], reserveTarget: number) {
  const weeks: { start: string; inflow: number; outflow: number; committed: number; closingBalance: number; belowReserve: boolean }[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const slice = days.slice(i, i + 7);
    const closing = slice[slice.length - 1].balance;
    weeks.push({
      start: slice[0].date,
      inflow: round(slice.reduce((t, d) => t + d.inflow, 0)),
      outflow: round(slice.reduce((t, d) => t + d.outflow, 0)),
      committed: round(slice.reduce((t, d) => t + d.committed, 0)),
      closingBalance: round(closing),
      belowReserve: closing < reserveTarget,
    });
  }
  return weeks;
}

const round = (n: number) => Math.round(n * 100) / 100;
