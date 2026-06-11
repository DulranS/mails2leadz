# Follow-Up State Fix

## Problem
When follow-up emails failed to send (e.g., "Missing required fields" error), the system was still marking them as "sent" in the database/state, even though the emails were never actually transmitted through Gmail API.

## Root Cause
1. The dashboard was updating local state (`setFollowUpHistory`) immediately after receiving an API response
2. The API was creating new database records even when emails failed to send
3. There was no verification that the email was actually sent via Gmail API before updating state

## Solution

### 1. API-Level Fix (`app/api/send-email/route.js`)
**Created separate follow-up handler:**
- Detects follow-up requests via `contact` and `followUpCount` parameters
- Sends email via Gmail API first
- **Only updates database after successful Gmail API transmission**
- Updates existing record instead of creating new one
- Increments follow-up count and calculates next follow-up date
- Returns error if Gmail API fails

**Key changes:**
```javascript
// Before: Always created new record
await addDoc(collection(db, 'sent_emails'), emailData);

// After: Updates existing record only after successful send
const response = await gmail.users.messages.send({...});
if (response.data.id) {
  await updateDoc(docRef, updateData);
  return { success: true, followUpCount: newFollowUpCount };
}
```

### 2. Dashboard-Level Fix (`app/dashboard/page.js`)
**Removed premature state updates:**
- Removed `setFollowUpHistory` calls from both follow-up functions
- State now only updates via `loadSentLeads()` and `loadRepliedAndFollowUp()` after successful API calls
- This ensures state reflects actual database state

**Before:**
```javascript
if (res.ok) {
  setFollowUpHistory(prev => ({
    ...prev,
    [email]: { count: data.followUpCount, ... }
  }));
}
```

**After:**
```javascript
if (res.ok) {
  // API already updated database
  await loadSentLeads();
  await loadRepliedAndFollowUp();
}
```

### 3. Data Integrity Improvements
**Follow-up record management:**
- Follow-ups now UPDATE existing records instead of creating duplicates
- Each email has one record with incrementing `followUpCount`
- `lastFollowUpAt` and `lastFollowUpSentAt` track actual send times
- `followUpDates` array logs all follow-up timestamps

**Follow-up schedule calculation:**
- Follow-up #1: 3 days after initial send
- Follow-up #2: 7 days after first follow-up
- Follow-up #3: 14 days after second follow-up
- Loop closes after 3 follow-ups

## Verification

### Test Scenarios
1. **Failed send**: Email fails to send → Database NOT updated → State unchanged
2. **Successful send**: Email sends successfully → Database updated → State reflects new count
3. **Network error**: API unreachable → No state change → Can retry
4. **Gmail API error**: Gmail rejects email → Error returned → No database update

### Expected Behavior
- ✅ State only changes when emails are ACTUALLY sent
- ✅ Failed sends don't increment follow-up count
- ✅ Database accurately reflects sent email history
- ✅ No duplicate records for same email
- ✅ Follow-up count is accurate and reliable

## Files Modified
1. `app/api/send-email/route.js` - Complete rewrite with follow-up handler
2. `app/dashboard/page.js` - Removed premature state updates
3. Both functions now rely on database as single source of truth

## Summary
The fix ensures data integrity by:
1. Only updating state after successful Gmail API transmission
2. Using database as single source of truth
3. Updating existing records instead of creating duplicates
4. Removing premature local state updates
5. Providing accurate error handling and retry capability
