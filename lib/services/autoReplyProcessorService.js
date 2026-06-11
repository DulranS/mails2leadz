import { supabaseAdmin } from '../supabaseClient';
import { createGmailClient } from '../server/googleGmailClient';
import { handleIncomingReply } from '../ai-responder';
import { createLogger } from '../logger';
import { ApiError } from '../errors';

const log = createLogger('autoReplyProcessorService');

const CONFIG = {
  BATCH_SIZE: 50
};

const getUnprocessedReplies = async (limit = CONFIG.BATCH_SIZE) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('email_threads')
      .select(`
        *,
        leads!inner(
          id,
          email,
          business_name,
          status,
          auto_reply_enabled,
          user_id
        ),
        user_integrations!inner(
          access_token,
          refresh_token,
          email,
          expires_at
        )
      `)
      .eq('direction', 'received')
      .eq('processed', false)
      .eq('leads.auto_reply_enabled', true)
      .limit(limit);

    if (error) {
      throw new ApiError('Unable to fetch unprocessed replies', {
        status: 500,
        code: 'FETCH_REPLIES_FAILED',
        details: error
      });
    }

    return data || [];
  } catch (error) {
    log.error('Failed to load unprocessed replies', error);
    throw error;
  }
};

const markReplyProcessed = async (threadId, update) => {
  const { error } = await supabaseAdmin
    .from('email_threads')
    .update(update)
    .eq('id', threadId);

  if (error) {
    log.warn('Failed to update reply processing state', { threadId, error });
  }
};

const scheduleIntelligentFollowup = async (leadId, intent) => {
  try {
    let followupDays = 3;
    let followupType = 'general';

    switch (intent) {
      case 'interested':
        followupDays = 1;
        followupType = 'hot_lead';
        break;
      case 'needs_info':
        followupDays = 2;
        followupType = 'information_request';
        break;
      case 'out_of_office':
        followupDays = 7;
        followupType = 'ooo_followup';
        break;
      default:
        followupType = 'general';
    }

    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + followupDays);
    const scheduledDateString = scheduledDate.toISOString().slice(0, 10);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('follow_up_schedule')
      .select('id')
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      throw new Error(existingError.message || 'Unable to check existing followups');
    }

    if (existing) {
      return { scheduled: false, reason: 'already_exists' };
    }

    const { data, error } = await supabaseAdmin
      .from('follow_up_schedule')
      .insert({
        lead_id: leadId,
        scheduled_date: scheduledDateString,
        follow_up_number: 1,
        status: 'pending',
        followup_type: followupType,
        intent_context: intent,
        created_by: 'ai_system',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message || 'Unable to create followup schedule');
    }

    return {
      scheduled: true,
      followupId: data?.id,
      scheduledDate: scheduledDateString
    };
  } catch (error) {
    log.warn('Unable to schedule intelligent followup', error);
    return { scheduled: false, error: error.message || 'schedule_failed' };
  }
};

const processReply = async (thread) => {
  const threadId = thread.id;
  const leadId = thread.leads?.id;

  try {
    if (!thread.user_integrations) {
      throw new ApiError('Missing user integration credentials', {
        status: 400,
        code: 'MISSING_CREDENTIALS'
      });
    }

    const gmail = await createGmailClient(thread.user_integrations);

    const message = await gmail.users.messages.get({
      userId: 'me',
      id: thread.gmail_message_id,
      format: 'full'
    });

    const result = await handleIncomingReply({
      lead: thread.leads,
      gmail,
      message: message.data,
      threadRow: {
        id: thread.id,
        gmail_thread_id: thread.gmail_thread_id,
        subject: thread.subject
      }
    });

    await markReplyProcessed(threadId, {
      processed: true,
      processed_at: new Date().toISOString(),
      ai_intent: result?.intent || null,
      ai_reply_sent: Boolean(result?.aiReplyText)
    });

    const followupResult = result?.aiReplyText
      ? await scheduleIntelligentFollowup(leadId, result.intent)
      : { scheduled: false, reason: 'no_ai_reply' };

    return {
      success: true,
      threadId,
      leadId,
      intent: result?.intent || null,
      aiReplySent: Boolean(result?.aiReplyText),
      followup: followupResult
    };
  } catch (error) {
    await markReplyProcessed(threadId, {
      processed: true,
      processed_at: new Date().toISOString(),
      processing_error: error.message
    });

    log.error('Error processing reply', { threadId, error });

    return {
      success: false,
      threadId,
      leadId,
      error: error.message
    };
  }
};

export const processAutoReplyBatch = async () => {
  const replies = await getUnprocessedReplies();
  if (replies.length === 0) {
    return { processed: 0, successful: 0, failed: 0, details: [] };
  }

  const results = [];
  for (const thread of replies) {
    const result = await processReply(thread);
    results.push(result);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return {
    processed: results.length,
    successful: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
    details: results
  };
};
