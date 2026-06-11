# Followup System Fix - Testing Guide

## Issues Fixed

### 1. **Gmail Authentication Problems**
- **Issue**: OAuth tokens were not being refreshed automatically
- **Fix**: Added automatic token refresh with credential updates
- **Impact**: Prevents authentication failures after token expiry

### 2. **Email Sending Failures**
- **Issue**: Improper MIME message formatting and missing thread references
- **Fix**: Correct MIME headers, proper message threading, and comprehensive error handling
- **Impact**: Emails now send successfully and maintain conversation threads

### 3. **Database Query Issues**
- **Issue**: Missing filters for active integrations and proper user matching
- **Fix**: Enhanced queries with proper filtering for active Gmail integrations
- **Impact**: Only processes followups for valid, active integrations

### 4. **Tracking and Logging Problems**
- **Issue**: Incomplete tracking of sent emails and processing status
- **Fix**: Comprehensive logging with processing timestamps, retry counts, and status tracking
- **Impact**: Full visibility into followup processing and delivery

### 5. **Error Handling and Reliability**
- **Issue**: No retry logic for failed email sends
- **Fix**: Exponential backoff retry mechanism with detailed error logging
- **Impact**: Increased reliability and automatic recovery from temporary failures

## Testing the Fixed System

### 1. **System Health Check**
```bash
curl "http://localhost:3000/api/followup-debug?userId=YOUR_USER_ID"
```

This will show:
- Gmail integration status
- Lead configuration
- Followup schedules
- Email thread tracking
- AI response history
- System health assessment

### 2. **Manual Followup Trigger**
```bash
curl -X POST http://localhost:3000/api/followup-debug \
  -H "Content-Type: application/json" \
  -d '{
    "followupId": "FOLLOWUP_UUID",
    "userId": "YOUR_USER_ID",
    "forceSend": true
  }'
```

### 3. **Background Processor Test**
```bash
curl -X POST http://localhost:3000/api/followup-scheduler
```

### 4. **Auto-Reply Processor Test**
```bash
curl -X POST http://localhost:3000/api/auto-reply-processor
```

## Verification Steps

### 1. **Check Gmail Integration**
```sql
SELECT * FROM user_integrations 
WHERE provider = 'google' 
  AND service = 'gmail' 
  AND is_active = true;
```

### 2. **Verify Followup Schedules**
```sql
SELECT 
  fs.*,
  l.email,
  l.business_name,
  l.status as lead_status
FROM follow_up_schedule fs
JOIN leads l ON fs.lead_id = l.id
WHERE fs.status = 'pending'
  AND fs.scheduled_date <= CURRENT_DATE
  AND l.auto_reply_enabled = true;
```

### 3. **Check Email Thread Tracking**
```sql
SELECT 
  et.*,
  l.email,
  l.business_name
FROM email_threads et
JOIN leads l ON et.lead_id = l.id
WHERE et.is_followup = true
  AND et.direction = 'sent'
ORDER BY et.sent_at DESC
LIMIT 10;
```

### 4. **Monitor AI Activity**
```sql
SELECT * FROM ai_activity_log 
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC
LIMIT 20;
```

## Debugging Common Issues

### Issue: No Followups Being Processed
1. Check if user has active Gmail integrations
2. Verify leads have `auto_reply_enabled = true`
3. Ensure followup schedules exist with `status = 'pending'`
4. Check if scheduled_date is today or in the past

### Issue: Emails Not Sending
1. Verify OAuth tokens are valid and not expired
2. Check Gmail API permissions
3. Look for authentication errors in logs
4. Verify email addresses are valid

### Issue: Missing Email Tracking
1. Check if `email_threads` table is being populated
2. Verify `processed` flag is being set correctly
3. Check for database errors in logs

## Performance Monitoring

### Key Metrics to Monitor:
1. **Processing Success Rate**: % of followups processed successfully
2. **Email Delivery Rate**: % of emails sent without errors
3. **Authentication Failures**: Number of token refresh failures
4. **Retry Rate**: % of emails requiring retries
5. **Processing Duration**: Average time to process each followup

### Alert Thresholds:
- Authentication failures > 5% → Investigate OAuth setup
- Email delivery failures > 10% → Check Gmail API limits
- Processing duration > 30 seconds → Optimize queries
- Retry rate > 20% → Check network stability

## Production Deployment Checklist

### 1. **Environment Variables**
```env
OPENAI_API_KEY=your_openai_key
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id
NEXT_PUBLIC_GOOGLE_CLIENT_SECRET=your_client_secret
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=your_redirect_uri
NEXT_PUBLIC_BASE_URL=https://yourdomain.com
```

### 2. **Database Migration**
- Run the complete migration from `database/migrations/ai_auto_reply_system.sql`
- Verify all tables and indexes are created
- Test Row Level Security policies

### 3. **Background Processor Setup**
```javascript
// In your main app file
import { startBackgroundProcessor } from './lib/ai-background-processor';

if (typeof window === 'undefined') {
  startBackgroundProcessor();
}
```

### 4. **Monitoring Setup**
- Set up log aggregation for error tracking
- Configure alerts for high failure rates
- Monitor database performance
- Track API rate limits

## Troubleshooting Commands

### Quick System Status
```bash
curl "http://localhost:3000/api/ai-status?userId=YOUR_USER_ID"
```

### Followup Debug Analysis
```bash
curl "http://localhost:3000/api/followup-debug?userId=YOUR_USER_ID"
```

### Force Process Specific Followup
```bash
curl -X POST http://localhost:3000/api/followup-debug \
  -H "Content-Type: application/json" \
  -d '{
    "followupId": "SPECIFIC_FOLLOWUP_ID",
    "userId": "YOUR_USER_ID",
    "forceSend": true
  }'
```

## Expected Behavior After Fix

1. **Automatic Processing**: Followups are processed every 15 minutes automatically
2. **Reliable Email Sending**: Emails are sent with proper threading and retry logic
3. **Complete Tracking**: All activities are logged with timestamps and status
4. **Token Management**: OAuth tokens refresh automatically when needed
5. **Error Recovery**: Failed sends are retried with exponential backoff
6. **Health Monitoring**: System health is continuously monitored and reported

The followup system should now work reliably with comprehensive tracking and error handling.
