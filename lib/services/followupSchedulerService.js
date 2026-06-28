// Optimized Followup Scheduler Service - No Redis for stability
import { redisClient } from '../redis';
import { createGmailClient } from '../server/googleGmailClient';

const CONFIG = {
  BATCH_SIZE: 10, // Reduced for performance
  MAX_FOLLOWUPS_PER_LEAD: 2,
  FOLLOWUP_INTERVALS: {
    hot_lead: [2, 5],
    warm_lead: [5, 10],
    cold_lead: [10, 20],
    information_request: [3, 7],
    ooo_followup: [14, 21]
  }
};

// Simple in-memory cache fallback
let cache = {
  leads: null,
  threads: {},
  done: []
};

const clearCache = () => {
  cache = { leads: null, threads: {}, done: [] };
};

const getLeads = async () => {
  if (cache.leads && Date.now() - cache.leads.timestamp < 300000) { // 5min cache
    return cache.leads.data;
  }
  const { data } = await supabaseAdmin.from('leads').select('*');
  cache.leads = { data, timestamp: Date.now() };
  return data;
};

const getThreads = async (leadId) => {
  if (cache.threads[leadId] && Date.now() - cache.threads[leadId].timestamp < 60000) {
    return cache.threads[leadId].data;
  }
  const { data } = await supabaseAdmin
    .from('email_threads')
    .select('subject, body, direction, sent_at')
    .eq('lead_id', leadId)
    .order('sent_at', { ascending: false })
    .limit(2);
  cache.threads[leadId] = { data, timestamp: Date.now() };
  return data;
};

const generateFollowupContent = async (lead, followupType, followupNumber) => {
  try {
    const recentThreads = await getThreads(lead.id);
    const conversationHistory = (recentThreads || [])
      .map((thread) => `${thread.direction?.toUpperCase()}: ${thread.body?.substring(0, 100) || ''}`)
      .join('\n\n');

    const businessName = lead.business_name || lead.email?.split('@')[0] || 'there';
    const calendlyLink = process.env.CALENDLY_LINK || '';

    const prompt = `Follow-up email #${followupNumber} to ${businessName}.\n\nRecent: ${conversationHistory.substring(0, 200)}`;
    
    const result = await generateReplyForIntent('followup', prompt, lead, 'Follow-up email generation');
    return result;
  } catch (error) {
    log.error('Error generating followup content', error);
    return null;
  }
};

const sendFollowupEmail = async (followup, gmail, content) => {
  try {
    const rawMessage = `From: ${process.env.GMAIL_SENDER_EMAIL || 'noreply@email.com'}\r\nTo: ${followup.leads.email}\r\nSubject: ${content.subject || 'Following up'}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${content.body}`;
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

// Main export function
export const processDueFollowups = async (limit = CONFIG.BATCH_SIZE) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data: followups, error } = await supabaseAdmin
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

    const dueFollowups = followups || [];
    if (dueFollowups.length === 0) {
      return { processed: 0, successful: 0, failed: 0, details: [] };
    }

    // Process with rate limiting
    const details = [];
    for (const followup of dueFollowups) {
      const result = await processSingleFollowup(followup);
      details.push(result);
      await new Promise((resolve) => setTimeout(resolve, 200)); // Rate limit
    }

    // Clear cache periodically
    cache.done.push(...dueFollowups.map(f => f.id));

    return {
      processed: details.length,
      successful: details.filter((item) => item.success).length,
      failed: details.filter((item) => !item.success).length,
      details
    };
  } catch (error) {
    log.error('Followup scheduler error', error);
    return { processed: 0, successful: 0, failed: 0, error: error.message };
  }
};

// Utility exports
export const getFollowupStats = async () => {
  const { data: all } = await supabaseAdmin.from('follow_up_schedule').select('status');
  const stats = {
    total: all?.length || 0,
    pending: all?.filter(f => f.status === 'pending').length || 0,
    sent: all?.filter(f => f.status === 'sent').length || 0,
    failed: all?.filter(f => f.status === 'failed').length || 0
  };
  return stats;
};

export const scheduleFollowup = async (lead, followupType) => {
  const intervals = CONFIG.FOLLOWUP_INTERVALS[followupType] || [7, 14];
  const daysToAdd = intervals[0];
  const scheduledDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  
  const { data, error } = await supabaseAdmin
    .from('follow_up_schedule')
    .insert({
      lead_id: lead.id,
      followup_type: followupType,
      follow_up_number: 1,
      scheduled_date: scheduledDate,
      status: 'pending'
    });
  
  return { data, error };
};