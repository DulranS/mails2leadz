// Quiet hours for text messages (v177). A business that sets a time zone and a sending window (default 08:00 to 20:00 local) gets
// its SMS reminders only inside that window. A reminder that falls outside it is not sent and not logged, so the next daily run
// tries again. Email is not affected. With no time zone set, nothing is held back (the behaviour before this setting existed).
// Pure: no I/O; the caller passes `now`.

export const DEFAULT_SMS_FROM_HOUR = 8;
export const DEFAULT_SMS_UNTIL_HOUR = 20;

export function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// The hour (0 to 23) on the wall clock in `timeZone` at the instant `now`. Null for an unknown time zone.
export function localHour(timeZone: string, now: Date): number | null {
  try {
    const part = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .find((p) => p.type === "hour");
    if (!part) return null;
    const h = Number(part.value) % 24;
    return Number.isInteger(h) ? h : null;
  } catch {
    return null;
  }
}

export interface QuietHoursInput {
  smsTimeZone?: string;
  smsSendFromHour?: number;
  smsSendUntilHour?: number;
}

// Whether a text may go out at `now`. A window that wraps midnight (from 22 until 6) is allowed.
export function smsAllowedAt(a: QuietHoursInput | undefined | null, now: Date): boolean {
  const tz = (a?.smsTimeZone ?? "").trim();
  if (!tz) return true;
  const hour = localHour(tz, now);
  if (hour === null) return true; // an unreadable zone is never a reason to drop a reminder; validation refuses it when saved
  const from = a?.smsSendFromHour ?? DEFAULT_SMS_FROM_HOUR;
  const until = a?.smsSendUntilHour ?? DEFAULT_SMS_UNTIL_HOUR;
  return from < until ? hour >= from && hour < until : hour >= from || hour < until;
}

export function validateQuietHours(a: QuietHoursInput): string | null {
  const tz = (a.smsTimeZone ?? "").trim();
  if (!tz) return null;
  if (!validTimeZone(tz)) return "That time zone isn't recognised. Use a name such as Asia/Colombo or Europe/London.";
  for (const v of [a.smsSendFromHour, a.smsSendUntilHour]) {
    if (v !== undefined && (!Number.isInteger(v) || v < 0 || v > 23)) return "The sending hours are whole numbers from 0 to 23.";
  }
  const from = a.smsSendFromHour ?? DEFAULT_SMS_FROM_HOUR;
  const until = a.smsSendUntilHour ?? DEFAULT_SMS_UNTIL_HOUR;
  if (from === until) return "The sending window needs a start and an end hour that are different.";
  return null;
}
