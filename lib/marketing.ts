// Email campaigns to customers who agreed to offers. Pure: no I/O. The send itself is app/api/marketing/send.
// The rule that matters: an offer goes only to a customer whose marketingOptIn is true, only to an email address on their record,
// and every email carries a one-click unsubscribe link that switches that consent off for good (app/api/unsubscribe).
import { customerEmail } from "./overdueReminders";

export const MARKETING_RUN_LIMIT = 100; // emails per send: a mistake cannot mail the whole list at once
export const MARKETING_DAILY_LIMIT = 200; // emails per business per day, across sends
export const UNSUBSCRIBE_LINK_DAYS = 365;
export const MIN_SUBJECT = 3;
export const MAX_SUBJECT = 120;
export const MIN_BODY = 10;
export const MAX_BODY = 2000;

export function validateCampaign(c: { subject: string; body: string }): string | null {
  const subject = (c.subject ?? "").trim();
  const body = (c.body ?? "").trim();
  if (subject.length < MIN_SUBJECT || subject.length > MAX_SUBJECT) return `Write a subject of ${MIN_SUBJECT} to ${MAX_SUBJECT} characters.`;
  if (/[\r\n]/.test(subject)) return "The subject must be one line.";
  if (body.length < MIN_BODY) return "Write the message you want to send.";
  if (body.length > MAX_BODY) return `Keep the message under ${MAX_BODY} characters.`;
  return null;
}

export interface CampaignCustomer { id: string; name: string; contact?: string; marketingOptIn?: boolean }
export interface Recipient { customerId: string; name: string; email: string }

// Who would receive it: agreed to offers, has an email address, once per address.
export function campaignRecipients(customers: CampaignCustomer[]): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const c of customers) {
    if (c.marketingOptIn !== true) continue;
    const email = customerEmail(c.contact);
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ customerId: c.id, name: c.name, email });
  }
  return out;
}

export function firstName(name: string): string {
  const n = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return n.slice(0, 40);
}

// The email text: a greeting, the owner's message, and the reason they are getting it with the unsubscribe link.
export function campaignText(p: { businessName: string; customerName: string; body: string; unsubscribeUrl: string }): string {
  const business = p.businessName.trim() || "us";
  const hello = firstName(p.customerName) ? `Hi ${firstName(p.customerName)},` : "Hello,";
  return [
    hello,
    "",
    p.body.trim(),
    "",
    "--",
    `You are getting this because you agreed to hear about offers from ${business}.`,
    `To stop these emails, open this link: ${p.unsubscribeUrl}`,
  ].join("\n");
}

// How many more can go today, given what was already sent today.
export function remainingToday(sentToday: number): number {
  return Math.max(0, MARKETING_DAILY_LIMIT - Math.max(0, Math.floor(sentToday)));
}
