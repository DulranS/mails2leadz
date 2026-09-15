import { getSupabase } from './supabase';
import { defaultAccountFields } from '../business.config';

/**
 * Returns the account row for this user, creating one with sensible
 * defaults on their very first login. One account per user — no team
 * invites/multi-seat here, that's a real feature to build later, not now.
 * Uses the service-role client so it works from server routes regardless
 * of RLS (the row it creates is still owned by and scoped to this user).
 */
export async function getOrCreateAccount(userId) {
  const supabase = getSupabase();

  const { data: existing, error: fetchErr } = await supabase
    .from('accounts')
    .select('*')
    .eq('owner_id', userId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (existing) return existing;

  const { data: created, error: insertErr } = await supabase
    .from('accounts')
    .insert({ owner_id: userId, ...defaultAccountFields })
    .select('*')
    .single();

  if (insertErr) throw insertErr;
  return created;
}

/**
 * Convenience shape passed into lib/ai.js and lib/followup.js so those
 * modules never import an account row directly — keeps them easy to test.
 */
export function businessProfileFrom(account) {
  return {
    name: account.name,
    senderName: account.sender_name,
    senderRole: account.sender_role,
    offerType: account.offer_type,
    offerDescription: account.offer_description,
    callToAction: account.cta,
    tone: account.tone,
    limits: {
      maxEmailsPerDay: account.max_emails_per_day,
      maxWhatsappPerDay: account.max_whatsapp_per_day,
      minHoursBetweenFollowups: account.min_hours_between_followups,
      maxFollowups: account.max_followups,
    },
  };
}
