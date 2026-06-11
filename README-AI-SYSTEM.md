# AI Auto-Reply and Followup System - Setup Guide

## Overview

This professional AI-powered auto-reply system automatically responds to incoming emails and schedules intelligent followups without requiring manual intervention. The system uses OpenAI's GPT-4 to understand email intent and generate contextually appropriate responses.

## Features

### 🤖 Intelligent Auto-Replies
- **Intent Classification**: Automatically categorizes incoming replies as interested, not_interested, needs_info, out_of_office, or unsubscribe
- **Context-Aware Responses**: Generates personalized replies based on conversation history and lead status
- **Smart Timing**: Processes replies with configurable delays to appear natural
- **Thread Continuity**: Maintains email thread context for seamless conversations

### 📅 Intelligent Followup Scheduling
- **Dynamic Intervals**: Different followup schedules based on lead status (hot, warm, cold)
- **Content Personalization**: AI generates followup content specific to each lead's situation
- **Automatic Scheduling**: Creates next followup automatically after each interaction
- **Maximum Limits**: Configurable maximum followups per lead to prevent spam

### 🔄 Background Processing
- **Automated Processing**: Runs continuously in the background without manual triggers
- **Error Handling**: Robust error handling with retry mechanisms
- **Activity Logging**: Comprehensive logging of all AI activities
- **Health Monitoring**: System health checks and status reporting

## Architecture

### Core Components

1. **AI Responder Service** (`lib/ai-responder.js`)
   - Intent classification using GPT-4
   - Response generation for different scenarios
   - Gmail API integration for sending replies

2. **Background Processor** (`lib/ai-background-processor.js`)
   - Scheduled processing of auto-replies and followups
   - Cleanup of old data
   - System health monitoring

3. **API Endpoints**
   - `/api/gmail-webhook` - Real-time Gmail push notifications
   - `/api/auto-reply-processor` - Manual auto-reply processing
   - `/api/followup-scheduler` - Manual followup processing
   - `/api/ai-settings` - Configuration management
   - `/api/ai-status` - System status and monitoring

4. **Database Schema**
   - `ai_responses` - Stores AI-generated responses
   - `follow_up_schedule` - Manages followup scheduling
   - `ai_settings` - User configuration
   - `ai_activity_log` - Activity tracking

## Setup Instructions

### 1. Database Migration

Run the SQL migration in `database/migrations/ai_auto_reply_system.sql` in your Supabase SQL editor:

```sql
-- Copy and paste the entire migration file content
```

### 2. Environment Variables

Add these to your `.env.local` file:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Scheduling
CALENDLY_LINK=your_calendly_link_here

# Google OAuth (already required for email sending)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
NEXT_PUBLIC_GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=your_google_redirect_uri

# Gmail Webhook Security
GMAIL_WEBHOOK_SECRET=your_webhook_secret_here

# Base URL for background processor
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### 3. Gmail Webhook Setup

1. Go to Google Cloud Console
2. Enable Gmail API push notifications
3. Set webhook URL to: `https://yourdomain.com/api/gmail-webhook`
4. Configure webhook security with your `GMAIL_WEBHOOK_SECRET`

### 4. Background Processor Integration

Add this to your main application file (e.g., `app/layout.js` or `pages/_app.js`):

```javascript
import { startBackgroundProcessor } from '../lib/ai-background-processor';

// Start the background processors when the app initializes
if (typeof window === 'undefined') {
  startBackgroundProcessor();
}
```

### 5. User Integration Setup

Ensure users have Gmail integration stored in the `user_integrations` table:

```sql
INSERT INTO user_integrations (
  user_id, 
  provider, 
  service, 
  email, 
  access_token, 
  refresh_token
) VALUES (
  'user_uuid',
  'google',
  'gmail',
  'user@gmail.com',
  'oauth_access_token',
  'oauth_refresh_token'
);
```

## Configuration

### AI Settings

Users can configure AI behavior through the `/api/ai-settings` endpoint:

```javascript
// Example configuration
{
  "auto_reply_enabled": true,
  "auto_followup_enabled": true,
  "max_followups_per_lead": 3,
  "reply_delay_minutes": 5,
  "followup_intervals": {
    "hot_lead": [1, 3, 7],
    "warm_lead": [3, 7, 14],
    "cold_lead": [7, 14, 30],
    "information_request": [2, 5, 10],
    "ooo_followup": [7, 14, 21]
  },
  "working_hours_start": "09:00:00",
  "working_hours_end": "17:00:00",
  "timezone": "UTC",
  "custom_instructions": "Additional AI instructions..."
}
```

### Lead Configuration

Enable auto-reply for specific leads:

```sql
UPDATE leads 
SET auto_reply_enabled = true 
WHERE user_id = 'user_uuid';
```

## Monitoring

### System Status

Check system health via `/api/ai-status?userId=user_uuid`:

```javascript
// Response includes:
{
  "system": {
    "enabled": true,
    "processor_status": {...},
    "last_updated": "2024-01-01T00:00:00Z"
  },
  "statistics": {
    "today": {
      "ai_responses": 15,
      "followups_completed": 8,
      "intent_breakdown": {...}
    },
    "pending": {
      "unprocessed_replies": 2,
      "due_followups": 5
    }
  },
  "health": {
    "status": "healthy",
    "issues": []
  }
}
```

### Activity Logs

Monitor AI activities in the `ai_activity_log` table:

```sql
SELECT * FROM ai_activity_log 
WHERE user_id = 'user_uuid' 
ORDER BY created_at DESC 
LIMIT 50;
```

## Testing

### Manual Testing

1. **Test Auto-Reply Processing**:
   ```bash
   curl -X POST http://localhost:3000/api/auto-reply-processor
   ```

2. **Test Followup Processing**:
   ```bash
   curl -X POST http://localhost:3000/api/followup-scheduler
   ```

3. **Check System Status**:
   ```bash
   curl http://localhost:3000/api/ai-status?userId=your_user_id
   ```

### Simulating Incoming Replies

Create test entries in `email_threads`:

```sql
INSERT INTO email_threads (
  lead_id,
  gmail_thread_id,
  gmail_message_id,
  subject,
  direction,
  body,
  sent_at,
  processed
) VALUES (
  'lead_uuid',
  'thread_123',
  'msg_456',
  'Re: Your proposal',
  'received',
  'I am interested in learning more...',
  NOW(),
  false
);
```

## Security Considerations

1. **Webhook Security**: Always verify webhook signatures using `GMAIL_WEBHOOK_SECRET`
2. **Token Security**: Store OAuth tokens securely in the database
3. **Rate Limiting**: Implement rate limiting for API endpoints
4. **Data Privacy**: Ensure compliance with data protection regulations

## Troubleshooting

### Common Issues

1. **Auto-replies not sending**:
   - Check `ai_settings.auto_reply_enabled` is true
   - Verify Gmail OAuth tokens are valid
   - Check `leads.auto_reply_enabled` for specific leads

2. **Followups not scheduling**:
   - Ensure `ai_settings.auto_followup_enabled` is true
   - Check if followup limits are reached
   - Verify lead status and intent classification

3. **Background processor not working**:
   - Check if `startBackgroundProcessor()` is called
   - Verify `NEXT_PUBLIC_BASE_URL` is correct
   - Check logs for errors

### Debug Logging

Enable detailed logging by setting environment variable:

```env
DEBUG=ai:*
```

## Performance Optimization

1. **Batch Processing**: Processes emails in batches to avoid API limits
2. **Rate Limiting**: Implements delays between API calls
3. **Caching**: Caches user credentials and settings
4. **Cleanup**: Automatic cleanup of old data to maintain performance

## Scaling Considerations

1. **Horizontal Scaling**: Multiple instances can share the same database
2. **Queue System**: Consider using Redis or similar for distributed processing
3. **Load Balancing**: Distribute webhook processing across multiple servers
4. **Monitoring**: Implement comprehensive monitoring and alerting

## Support

For issues or questions:
1. Check the activity logs in `ai_activity_log`
2. Review system status via `/api/ai-status`
3. Verify all environment variables are set correctly
4. Ensure database migrations are applied successfully

---

**Note**: This system requires proper OpenAI API access and Gmail API permissions. Ensure all necessary APIs are enabled and properly configured in your Google Cloud Console.
