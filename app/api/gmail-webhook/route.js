// app/api/gmail-webhook/route.js
import { NextResponse } from 'next/server';
import { handleIncomingReply } from '../../../lib/ai-responder';
import { supabaseAdmin } from '../../../lib/supabaseClient';
import { google } from 'googleapis';

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  WEBHOOK_SECRET: process.env.GMAIL_WEBHOOK_SECRET,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
};

// ============================================================================
// VERIFY WEBHOOK SIGNATURE
// ============================================================================
const verifyWebhook = (request) => {
  const signature = request.headers.get('x-gmail-signature');
  const timestamp = request.headers.get('x-gmail-timestamp');
  
  if (!CONFIG.WEBHOOK_SECRET) {
    console.warn('[Gmail Webhook] No webhook secret configured, skipping verification');
    return true;
  }
  
  // Implement proper webhook verification here
  // For now, we'll proceed with basic checks
  return true;
};

// ============================================================================
// GET USER GMAIL CREDENTIALS
// ============================================================================
const getUserGmailCredentials = async (userId) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_integrations')
      .select('access_token, refresh_token, email')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .eq('service', 'gmail')
      .single();
    
    if (error || !data) {
      console.error(`[Gmail Webhook] No Gmail credentials found for user ${userId}`);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('[Gmail Webhook] Error fetching user credentials:', error);
    return null;
  }
};

// ============================================================================
// PROCESS GMAIL MESSAGE
// ============================================================================
const processGmailMessage = async (messageData, userId) => {
  try {
    const credentials = await getUserGmailCredentials(userId);
    if (!credentials) {
      throw new Error('No Gmail credentials found');
    }
    
    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI
    );
    
    oauth2Client.setCredentials({
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token
    });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Get full message details
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageData.messageId,
      format: 'full'
    });
    
    // Extract thread ID and check if it's a reply
    const threadId = message.data.threadId;
    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: threadId
    });
    
    // Check if this is a reply to a sent message
    const messages = thread.data.messages || [];
    if (messages.length < 2) {
      console.log(`[Gmail Webhook] Message ${messageData.messageId} is not a reply, skipping`);
      return { processed: false, reason: 'Not a reply' };
    }
    
    // Find the original sent message
    const originalMessage = messages.find(msg => 
      msg.payload.headers.find(header => 
        header.name.toLowerCase() === 'from' && 
        header.value.includes(credentials.email)
      )
    );
    
    if (!originalMessage) {
      console.log(`[Gmail Webhook] No original sent message found in thread ${threadId}`);
      return { processed: false, reason: 'No original message found' };
    }
    
    // Find lead associated with this thread
    const { data: threadData } = await supabaseAdmin
      .from('email_threads')
      .select('lead_id, id')
      .eq('gmail_thread_id', threadId)
      .single();
    
    if (!threadData) {
      console.log(`[Gmail Webhook] No lead found for thread ${threadId}`);
      return { processed: false, reason: 'No lead found' };
    }
    
    // Get lead details
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', threadData.lead_id)
      .single();
    
    if (!lead) {
      console.log(`[Gmail Webhook] Lead ${threadData.lead_id} not found`);
      return { processed: false, reason: 'Lead not found' };
    }
    
    // Check if auto-reply is enabled for this lead
    if (!lead.auto_reply_enabled) {
      console.log(`[Gmail Webhook] Auto-reply disabled for lead ${threadData.lead_id}`);
      return { processed: false, reason: 'Auto-reply disabled' };
    }
    
    // Process the incoming reply with AI
    const result = await handleIncomingReply({
      lead,
      gmail,
      message: message.data,
      threadRow: {
        id: threadData.id,
        gmail_thread_id: threadId,
        subject: message.data.payload.headers.find(h => h.name.toLowerCase() === 'subject')?.value || ''
      }
    });
    
    console.log(`[Gmail Webhook] Processed reply for lead ${threadData.lead_id}:`, result);
    
    return { 
      processed: true, 
      leadId: threadData.lead_id,
      intent: result?.intent,
      aiReplySent: !!result?.aiReplyText 
    };
    
  } catch (error) {
    console.error('[Gmail Webhook] Error processing message:', error);
    throw error;
  }
};

// ============================================================================
// POST HANDLER - GMAIL PUSH NOTIFICATION
// ============================================================================
export async function POST(request) {
  try {
    // Verify webhook
    if (!verifyWebhook(request)) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    const { message } = body;
    
    if (!message || !message.data) {
      return NextResponse.json(
        { error: 'Invalid webhook payload' },
        { status: 400 }
      );
    }
    
    // Decode message data (base64 encoded)
    const decodedData = Buffer.from(message.data, 'base64').toString('utf8');
    const messageData = JSON.parse(decodedData);
    
    console.log('[Gmail Webhook] Received notification:', messageData);
    
    // Get user ID from email address
    const emailAddress = messageData.emailAddress;
    const { data: user } = await supabaseAdmin
      .from('user_integrations')
      .select('user_id')
      .eq('email', emailAddress)
      .eq('provider', 'google')
      .eq('service', 'gmail')
      .single();
    
    if (!user) {
      console.log(`[Gmail Webhook] No user found for email ${emailAddress}`);
      return NextResponse.json({ processed: false, reason: 'User not found' });
    }
    
    // Process the message
    const result = await processGmailMessage(messageData, user.user_id);
    
    return NextResponse.json({
      success: true,
      processed: result.processed,
      ...result
    });
    
  } catch (error) {
    console.error('[Gmail Webhook] Error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET HANDLER - WEBHOOK VERIFICATION
// ============================================================================
export async function GET(request) {
  const searchParams = request.nextUrl.searchParams;
  const challenge = searchParams.get('challenge');
  
  if (challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
  
  return NextResponse.json({ 
    status: 'Gmail webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
}
