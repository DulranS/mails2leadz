# SMS Sales Qualification System

## Overview
Aggressive but polite SMS qualification system to filter out time-wasters from cold leads. Asks for budget, timeframe, and preferred contact method. Automatically archives unqualified leads and stops follow-ups.

## Features

### 1. Aggressive Qualification Message
- **Direct approach**: "What's your exact budget and timeframe to buy?"
- **Clear intent**: "Serious inquiries only please"
- **Action-oriented**: Forces leads to commit or be filtered out

### 2. Intelligent Response Parsing
- **Budget extraction**: Detects dollar amounts, ranges
- **Timeframe detection**: Identifies urgency (this week, next month, etc.)
- **Contact method**: Captures preferred communication channel
- **Negative detection**: Filters out "not interested", "no thanks", etc.
- **Vague response handling**: Archives "maybe", "someday", "not sure"

### 3. Automatic Lead Management
- **Qualified leads**: Format answers into clean summary, continue follow-ups
- **Unqualified leads**: Archive immediately, stop all follow-ups
- **Database updates**: Automatic status updates in Firebase

## How It Works

### Step 1: Send Qualification SMS
```javascript
// Dashboard button: "SMS Qualify All Leads"
handleSMSQualification(safeFollowUpCandidates)
```

**Message sent to lead:**
```
Hi [FirstName], quick question: What's your exact budget and timeframe to buy? (e.g., "this week" or "just looking") Also, what's your preferred contact method? Serious inquiries only please.
```

### Step 2: Lead Responds
**Qualified response example:**
```
$50k budget, looking to buy this week, prefer email
```

**Unqualified response example:**
```
Not interested, remove me
```

### Step 3: System Processes Response
```javascript
// Parse response
const qualification = parseQualificationResponse(response);

// If qualified
if (qualification.qualified) {
  // Update lead with qualification summary
  // Continue follow-ups
}

// If unqualified
if (shouldArchiveLead(qualification)) {
  // Archive lead
  // Stop all follow-ups
}
```

### Step 4: Results Display
**Qualified lead summary:**
```
✅ john@company.com
   Budget: $50k
   Timeframe: this week
   Contact: email
   Response: "$50k budget, looking to buy this week, prefer email"
```

**Unqualified lead summary:**
```
❌ john@company.com - Negative response (Archived)
```

## API Endpoints

### 1. Send Qualification SMS
**Endpoint:** `POST /api/send-sms-qualification`

**Request:**
```json
{
  "leads": [
    {
      "email": "john@company.com",
      "firstName": "John",
      "phone": "+1234567890"
    }
  ],
  "userId": "user123"
}
```

**Response:**
```json
{
  "success": true,
  "total": 1,
  "successCount": 1,
  "failCount": 0,
  "results": [
    {
      "email": "john@company.com",
      "status": "success",
      "phone": "+1234567890",
      "messageId": "msg_123"
    }
  ]
}
```

### 2. Handle SMS Reply
**Endpoint:** `POST /api/handle-sms-reply`

**Request:**
```json
{
  "phone": "+1234567890",
  "response": "$50k budget, this week, email",
  "userId": "user123"
}
```

**Response:**
```json
{
  "success": true,
  "qualified": true,
  "summary": "✅ john@company.com\n   Budget: $50k\n   Timeframe: this week\n   Contact: email\n   Response: \"$50k budget, this week, email\"",
  "shouldArchive": false,
  "stopFollowUp": false,
  "qualification": {
    "qualified": true,
    "budget": "$50k",
    "timeframe": "this week",
    "contactMethod": "email",
    "summary": {
      "budget": "$50k",
      "timeframe": "this week",
      "contactMethod": "email",
      "fullResponse": "$50k budget, this week, email"
    }
  }
}
```

## Response Parsing Logic

### Negative Keywords (Auto-Archive)
- "not interested"
- "no thanks"
- "stop"
- "remove"
- "unsubscribe"
- "not looking"
- "never"
- "no budget"

### Vague Keywords (Auto-Archive)
- "maybe"
- "someday"
- "later"
- "not sure"
- "don't know"
- "undecided"
- "thinking"

### Budget Detection Patterns
- `$50k`, `$50,000`, `50000`
- `budget: $50k`
- `50k budget`

### Timeframe Detection Patterns
- "this week"
- "next week"
- "this month"
- "next month"
- "3 days", "2 weeks"
- "asap", "immediately"
- "Q1", "quarter 1"

### Contact Method Detection
- "call", "phone", "text", "sms"
- "email"
- "whatsapp"
- "zoom", "meet"

## Database Schema

### sms_qualifications Collection
```javascript
{
  userId: "user123",
  email: "john@company.com",
  phone: "+1234567890",
  smsMessage: "Hi John, quick question...",
  sentAt: "2024-06-08T10:00:00Z",
  status: "sent",
  qualified: true,
  response: "$50k budget, this week, email",
  qualifiedAt: "2024-06-08T10:05:00Z",
  summary: {
    budget: "$50k",
    timeframe: "this week",
    contactMethod: "email",
    fullResponse: "$50k budget, this week, email"
  },
  archived: false,
  stopFollowUp: false
}
```

### sent_emails Collection (Updates)
```javascript
// For qualified leads
{
  qualified: true,
  qualificationSummary: {
    budget: "$50k",
    timeframe: "this week",
    contactMethod: "email"
  },
  qualifiedAt: "2024-06-08T10:05:00Z",
  qualificationMethod: "sms"
}

// For unqualified leads
{
  archived: true,
  archivedAt: "2024-06-08T10:05:00Z",
  archiveReason: "Negative response",
  stopFollowUp: true
}
```

## Integration with SMS Provider

### Twilio Integration (Example)
Edit `app/api/send-sms-qualification/route.js`:

```javascript
const twilio = require('twilio');
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendSMS(phone, message, provider) {
  try {
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    
    return { success: true, messageId: result.sid };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### Environment Variables Required
```
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

## Business Value

### Before SMS Qualification
- ❌ Wasting time on unqualified leads
- ❌ Sending follow-ups to time-wasters
- ❌ No clear budget/timeframe data
- ❌ Low conversion rates

### After SMS Qualification
- ✅ Immediate filtering of time-wasters
- ✅ Clear budget and timeframe data
- ✅ Focus only on serious buyers
- ✅ Higher conversion rates
- ✅ Automated lead management

## Usage

### 1. Select Leads
Go to Reply & Follow-Up Center → See leads ready for follow-up

### 2. Send Qualification SMS
Click "SMS Qualify All Leads" button

### 3. Wait for Responses
System automatically processes incoming SMS replies

### 4. Review Results
- Qualified leads: See qualification summary
- Unqualified leads: Automatically archived

### 5. Continue Follow-Ups
Only qualified leads continue in follow-up sequence

## Configuration

### Customize Qualification Message
Edit `lib/sms-qualifier.js`:

```javascript
export const generateQualificationSMS = (lead) => {
  const firstName = lead.firstName || lead.first_name || '';
  const businessName = lead.businessName || lead.company || '';
  
  return `Hi ${firstName}, quick question: What's your exact budget and timeframe to buy? (e.g., 'this week' or 'just looking') Also, what's your preferred contact method? Serious inquiries only please.`;
};
```

### Adjust Parsing Rules
Edit `lib/sms-qualifier.js` to add/remove keywords or patterns.

## Best Practices

1. **Use for cold leads only** - Don't qualify warm leads
2. **Send during business hours** - 9am-5pm local time
3. **Follow up quickly** - Respond within 1 hour of qualification
4. **Review summaries** - Check qualification results manually
5. **Adjust message** - Test different qualification approaches

## Troubleshooting

### SMS not sending
- Check SMS provider credentials
- Verify phone number format
- Check quota limits

### Responses not being processed
- Verify webhook is configured
- Check Firebase connection
- Review parsing logs

### Leads not being archived
- Check archive logic
- Verify database permissions
- Review response parsing

## Summary

The SMS Sales Qualification System is a business-focused tool to:
- **Filter time-wasters** immediately
- **Capture key data** (budget, timeframe, contact method)
- **Automate lead management** (archive unqualified)
- **Improve conversion rates** by focusing on serious buyers

**Less time wasted, more deals closed.**
