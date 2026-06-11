# Automatic Record Cleanup Implementation

## Overview
Strategic automatic cleanup of old sent email records to keep the database clean and optimize costs.

## Implementation Details

### 1. Automatic Cleanup in list-sent-leads API
**File**: `app/api/list-sent-leads/route.js`

**Behavior**:
- When loading sent leads, automatically deletes records older than 30 days
- Only deletes records where the follow-up loop is closed (30+ days old OR 3+ follow-ups sent OR replied)
- Returns only active records to the dashboard
- Logs cleanup activity for monitoring

**Configuration**:
```javascript
const AUTO_CLEANUP_DAYS = 30; // Delete records older than this
const CAMPAIGN_WINDOW_DAYS = 30; // Campaign window
const MAX_FOLLOW_UPS = 3; // Maximum follow-ups per lead
```

**Cleanup Logic**:
```javascript
const cutoffDate = new Date(now);
cutoffDate.setDate(cutoffDate.getDate() - AUTO_CLEANUP_DAYS);

const oldRecords = leads.filter(lead => {
  const sentAt = new Date(lead.sentAt);
  return sentAt < cutoffDate && lead.loopClosed;
});
```

**Safety Features**:
- Only deletes records where `loopClosed` is true
- Prevents deletion of active campaigns
- Batch deletion with error handling
- Returns deleted count in response

### 2. Dedicated Cleanup API Endpoint
**File**: `app/api/cleanup-old-records/route.js`

**Purpose**: Standalone endpoint for manual or scheduled cleanup

**Usage**:
```bash
curl -X POST http://localhost:3000/api/cleanup-old-records \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-id", "days": 30}'
```

**Response**:
```json
{
  "success": true,
  "deletedCount": 15,
  "skippedCount": 42,
  "errors": [],
  "cutoffDate": "2026-05-08T00:00:00.000Z"
}
```

**Features**:
- Configurable cleanup period (default 30 days)
- Per-user cleanup
- Detailed reporting (deleted, skipped, errors)
- Same safety logic as automatic cleanup

## Strategic Benefits

### 1. Cost Optimization
- Reduces Firestore document count
- Lowers storage costs
- Improves query performance

### 2. Data Hygiene
- Removes stale campaign data
- Prevents data bloat
- Maintains database performance

### 3. Campaign Integrity
- Only deletes completed campaigns
- Preserves active follow-up sequences
- Protects replied leads for analytics

### 4. Compliance
- Automatic data retention policy
- Configurable retention period
- Audit trail via logs

## Safety Mechanisms

### Loop Closure Check
A record is considered safe to delete only if:
- **Age**: Older than 30 days
- **AND** one of:
  - Follow-up count >= 3 (max reached)
  - Campaign window exceeded (30+ days)
  - Lead has replied

```javascript
const loopClosed = daysSinceSent > CAMPAIGN_WINDOW_DAYS || 
                  (data.followUpCount || 0) >= MAX_FOLLOW_UPS ||
                  data.replied === true;
```

### Error Handling
- Individual record deletion failures don't stop the process
- Errors are logged and reported
- Failed deletions are retried on next cleanup

### Filtering
- Deleted records are filtered from API response
- Dashboard only sees active records
- No UI disruption

## Monitoring

### Console Logs
```
🧹 Found 15 old records to clean up (older than 30 days)
🗑️ Deleted old record: contact@example.com (abc123)
✅ Cleanup complete: 15 records deleted
✅ Successfully loaded 42 sent leads for user xyz (15 old records deleted)
```

### API Response
```json
{
  "leads": [...], // Active records only
  "total": 42,
  "deletedCount": 15
}
```

## Configuration

### Adjust Cleanup Period
Edit `AUTO_CLEANUP_DAYS` in both API files:
```javascript
const AUTO_CLEANUP_DAYS = 14; // Change to 14 days
```

### Adjust Campaign Window
Edit `CAMPAIGN_WINDOW_DAYS`:
```javascript
const CAMPAIGN_WINDOW_DAYS = 60; // Extend to 60 days
```

### Adjust Max Follow-ups
Edit `MAX_FOLLOW_UPS`:
```javascript
const MAX_FOLLOW_UPS = 5; // Allow 5 follow-ups
```

## Production Recommendations

### 1. Scheduled Cleanup
Set up a cron job to call the cleanup endpoint daily:
```bash
# Run daily at 2 AM
0 2 * * * curl -X POST https://your-domain.com/api/cleanup-old-records \
  -H "Content-Type: application/json" \
  -d '{"userId": "system-user", "days": 30}'
```

### 2. Firebase Admin SDK
For production, use Firebase Admin SDK to bypass security rules:
```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

### 3. Monitoring
- Set up alerts for cleanup failures
- Monitor deleted record counts
- Track database size over time

### 4. Backup
- Consider exporting old records before deletion
- Store in cold storage for compliance
- Implement data retention policy

## Testing

### Test Cleanup Locally
```bash
curl -X POST http://localhost:3000/api/cleanup-old-records \
  -H "Content-Type: application/json" \
  -d '{"userId": "your-user-id", "days": 1}'
```

### Verify Dashboard
1. Load dashboard
2. Check console for cleanup logs
3. Verify old records are gone
4. Confirm active records still appear

## Summary

The automatic cleanup system:
- ✅ Deletes old records strategically (30+ days, loop closed)
- ✅ Preserves active campaigns and follow-up sequences
- ✅ Runs automatically when loading leads
- ✅ Provides manual cleanup endpoint
- ✅ Includes comprehensive error handling
- ✅ Logs all activity for monitoring
- ✅ Configurable for different retention policies

This ensures your database stays clean while preserving all active campaign data.
