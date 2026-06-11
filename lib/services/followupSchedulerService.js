import { supabaseAdmin } from '../supabaseClient';
import { createGmailClient } from '../server/googleGmailClient';
import { generateReplyForIntent } from '../ai-responder';
import { createLogger } from '../logger';
import { ApiError } from '../errors';

const log = createLogger('followupSchedulerService');

const CONFIG = {
  BATCH_SIZE: 50,
  MAX_FOLLOWUPS_PER_LEAD: 3,
  FOLLOWUP_INTERVALS: {
    hot_lead: [1, 3, 7],
    warm_lead: [3, 7, 14],
    cold_lead: [7, 14, 30],
    information_request: [2, 5, 10],
    ooo_followup: [7, 14, 21]
  }
};

const getDueFollowups = async (limit = CONFIG.BATCH_SIZE) => {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from('follow_up_schedule')
    .select(`
      *,
      leads!inner(
        id,
        email,
        business_name,
        status,
        auto_reply_enabled,
        user_id,
        last_contacted_at
      ),
      user_integrations!inner(
        access_token,
        refresh_token,
        email,
        provider,
        service,
        is_active,
        expires_at
      )
    `)
    .eq('status', 'pending')
    .lte('scheduled_date', today)
    .eq('leads.auto_reply_enabled', true)
    .eq('user_integrations.provider', 'google')
    .eq('user_integrations.service', 'gmail')
    .eq('user_integrations.is_active', true)
    .limit(limit);

  if (error) {
    throw new ApiError('Unable to fetch due followups', {
      status: 500,
      code: 'FETCH_FOLLOWUPS_FAILED',
      details: error
    });
  }

  return data || [];
};

const getFollowupIndex = (followupType, currentCount) => {
  const intervals = CONFIG.FOLLOWUP_INTERVALS[followupType] || CONFIG.FOLLOWUP_INTERVALS.general;
  return Math.min(currentCount, intervals.length - 1);
};

const generateFollowupContent = async (lead, followupType, followupNumber) => {
  try {
    const { data: recentThreads } = await supabaseAdmin
      .from('email_threads')
      .select('subject, body, direction, sent_at')
      .eq('lead_id', lead.id)
      .order('sent_at', { ascending: false })
      .limit(3);

    const conversationHistory = (recentThreads || [])
      .map((thread) => `${thread.direction?.toUpperCase()}: ${thread.body?.substring(0, 200) || ''}`)
      .join('\n\n');

    const businessName = lead.business_name || lead.email?.split('@')[0] || 'there';
    const calendlyLink = process.env.CALENDLY_LINK || '';

    const prompt = `Generate a followup email #${followupNumber} for a lead at ${businessName}.\n\nRecent conversation:\n${conversationHistory}\n\nInclude a professional tone, suggest a next step, and mention Calendly: ${calendlyLink}.`;

    const result = await generateReplyForIntent('followup', prompt, lead, 'Follow-up email generation');
    return result;
  } catch (error) {
    log.error('Error generating followup content', error);
    return null;
  }
};

const sendFollowupEmail = async (followup, gmail, content) => {
  try {
    const rawMessage = `From: ${process.env.GMAIL_SENDER_EMAIL}\r\nTo: ${followup.leads.email}\r\nSubject: ${content.subject || 'Following up'}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${content.body}`;
    const encoded = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded }
    });

    return response.data;
  } catch (error) {
    log.error('Error sending followup email', error);
    throw error;
  }
};

const markFollowupCompleted = async (followupId, update) => {
  const { error } = await supabaseAdmin
    .from('follow_up_schedule')
    .update(update)
    .eq('id', followupId);

  if (error) {
    log.warn('Failed to update followup schedule', { followupId, error });
  }
};

const processSingleFollowup = async (followup) => {
  try {
    const gmail = await createGmailClient(followup.user_integrations);
    const followupNumber = followup.follow_up_number || 1;
    const content = await generateFollowupContent(followup.leads, followup.followup_type, followupNumber);

    if (!content || !content.body) {
      throw new Error('Failed to generate followup content');
    }

    const messageData = await sendFollowupEmail(followup, gmail, content);

    await markFollowupCompleted(followup.id, {
      status: 'sent',
      sent_at: new Date().toISOString(),
      last_sent_message_id: messageData.id,
      updated_at: new Date().toISOString()
    });

    return { success: true, followupId: followup.id, messageId: messageData.id };
  } catch (error) {
    await markFollowupCompleted(followup.id, {
      status: 'failed',
      last_error: error.message,
      updated_at: new Date().toISOString()
    });
    return { success: false, followupId: followup.id, error: error.message };
  }
};

export const processDueFollowups = async () => {
  const followups = await getDueFollowups();
  if (followups.length === 0) {
    return { processed: 0, successful: 0, failed: 0, details: [] };
  }

  const details = [];
  for (const followup of followups) {
    const result = await processSingleFollowup(followup);
    details.push(result);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return {
    processed: details.length,
    successful: details.filter((item) => item.success).length,
    failed: details.filter((item) => !item.success).length,
    details
  };
};
