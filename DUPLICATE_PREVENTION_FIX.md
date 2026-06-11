# Duplicate Prevention & Attachment Fixes

## Issues Fixed

### 1. Duplicate Email Prevention
**Problem**: System was sending duplicate emails to the same email address.

**Solution**: Implemented time-based duplicate checking:
- **Initial emails**: Prevent sending to same email within 24 hours
- **Follow-ups**: Prevent sending follow-up to same email within 1 hour
- Uses Firebase queries with time filters
- Returns clear error messages when duplicates detected

### 2. Attachment Support
**Problem**: Dynamic template system not attaching files to emails.

**Solution**: Enhanced MIME message creation:
- Updated `createMimeMessage()` to handle attachments
- Supports multiple attachments per email
- Proper MIME multipart/mixed encoding
- Passes `emailAttachments` parameter through the entire chain

### 3. Template Variable Substitution
**Problem**: Template variables like `{{business_name}}` were not being replaced with actual data, appearing as literal text in emails.

**Solution**: Implemented comprehensive variable substitution:
- Created `replaceTemplateVariables()` helper function
- Supports all common variable name variations:
  - `{{first_name}}`, `{{firstName}}`, `{{First Name}}`, `{{first name}}`
  - `{{last_name}}`, `{{lastName}}`, `{{Last Name}}`, `{{last name}}`
  - `{{company}}`, `{{Company}}`, `{{business_name}}`, `{{businessName}}`, `{{Business Name}}`, `{{business name}}`, `{{business}}`, `{{Business}}`
- Fuzzy matching for unrecognized patterns
- Applied to both CSV email sending and follow-up sending
- Case-insensitive replacement

## Technical Details

### Duplicate Prevention Logic

#### Initial Emails (24-hour window)
```javascript
// Check duplicates - prevent sending to same email within 24 hours
const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
const duplicateQuery = query(
  collection(db, 'sent_emails'),
  where('userId', '==', userId),
  where('to', '==', email.toLowerCase()),
  where('sentAt', '>=', twentyFourHoursAgo.toISOString())
);

const duplicateSnapshot = await getDocs(duplicateQuery);
if (!duplicateSnapshot.empty) {
  // Skip - already sent within 24 hours
}
```

#### Follow-ups (1-hour window)
```javascript
// Check if follow-up was already sent recently (within 1 hour)
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
const recentFollowUpQuery = query(
  collection(db, 'sent_emails'),
  where('userId', '==', userId),
  where('to', '==', email.toLowerCase()),
  where('lastFollowUpSentAt', '>=', oneHourAgo.toISOString())
);

const recentSnapshot = await getDocs(recentFollowUpQuery);
if (!recentSnapshot.empty) {
  return { error: 'Follow-up already sent within the last hour' };
}
```

### Attachment Support

#### Enhanced MIME Message Creation
```javascript
const createMimeMessage = (to, subject, body, senderEmail, senderName, replyTo = null, attachments = []) => {
  const boundary = 'boundary_' + Math.random().toString(36).substring(7);
  
  let message = `From: ${senderName ? `${senderName} <${senderEmail}>` : senderEmail}\r\n`;
  message += `To: ${to}\r\n`;
  if (replyTo) message += `Reply-To: ${replyTo}\r\n`;
  message += `Subject: ${subject}\r\n`;
  message += `MIME-Version: 1.0\r\n`;
  
  if (attachments.length > 0) {
    // Multipart/mixed for attachments
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    
    // Text body
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
    message += `${body}\r\n`;
    
    // Attachments
    attachments.forEach(attachment => {
      const filename = attachment.filename || 'attachment';
      const content = attachment.content || attachment.data;
      
      message += `--${boundary}\r\n`;
      message += `Content-Type: application/octet-stream\r\n`;
      message += `Content-Disposition: attachment; filename="${filename}"\r\n`;
      message += `Content-Transfer-Encoding: base64\r\n\r\n`;
      message += `${content}\r\n`;
    });
    
    message += `--${boundary}--\r\n`;
  } else {
    // Simple text message
    message += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
    message += `${body}\r\n`;
  }
  
  return message;
};
```

#### Usage in Email Sending
```javascript
const rawMessage = createMimeMessage(
  email, 
  subject, 
  body, 
  senderEmail, 
  senderName, 
  replyToEmail, 
  emailAttachments  // ← Attachments passed here
);
```

### Template Variable Substitution Logic

#### Helper Function
```javascript
const replaceTemplateVariables = (text, firstName, lastName, businessName) => {
  if (!text) return '';
  
  // Define all common variable name variations
  const replacements = {
    '{{first_name}}': firstName,
    '{{firstName}}': firstName,
    '{{First Name}}': firstName,
    '{{first name}}': firstName,
    '{{last_name}}': lastName,
    '{{lastName}}': lastName,
    '{{Last Name}}': lastName,
    '{{last name}}': lastName,
    '{{company}}': businessName,
    '{{Company}}': businessName,
    '{{business_name}}': businessName,
    '{{businessName}}': businessName,
    '{{Business Name}}': businessName,
    '{{business name}}': businessName,
    '{{business}}': businessName,
    '{{Business}}': businessName
  };
  
  // Apply exact replacements first
  let result = text;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'gi'), value || '');
  }
  
  // Handle any remaining {{variable}} patterns with fuzzy matching
  result = result.replace(/\{\{([^}]+)\}\}/gi, (match, variable) => {
    const varName = variable.toLowerCase().replace(/[_\s]/g, '');
    if (varName.includes('firstname')) return firstName || '';
    if (varName.includes('lastname')) return lastName || '';
    if (varName.includes('company') || varName.includes('business')) return businessName || '';
    return match; // Keep original if not recognized
  });
  
  return result;
};
```

#### Usage in Email Sending
```javascript
// Apply template variable substitution
subject = replaceTemplateVariables(subject, firstName, lastName, businessName);
body = replaceTemplateVariables(body, firstName, lastName, businessName);
```

## API Changes

### POST /api/send-email

**Request Parameters:**
- `emailAttachments` (array): Array of attachment objects
  - `filename`: Name of the file
  - `content`: Base64-encoded file content
  - `data`: Alternative to `content`

**Response Changes:**
- Duplicate prevention now returns specific error messages:
  - `"Already sent (within 24 hours)"` for initial emails
  - `"Follow-up already sent within the last hour"` for follow-ups

## Error Handling

### Dashboard Integration

The dashboard already handles error responses:

```javascript
if (res.ok) {
  // Success
} else {
  addNotification(`❌ Follow-up failed: ${data.error}`, 'error');
}
```

**Error Messages Displayed:**
- "Already sent (within 24 hours)" - Initial email duplicate
- "Follow-up already sent within the last hour" - Follow-up duplicate
- Other API errors as they occur

## Testing

### Test Duplicate Prevention

1. **Initial Email Duplicate:**
   - Send email to john@company.com
   - Try to send again within 24 hours
   - Expected: Skipped with "Already sent (within 24 hours)"

2. **Follow-up Duplicate:**
   - Send follow-up to john@company.com
   - Try to send another follow-up within 1 hour
   - Expected: Error "Follow-up already sent within the last hour"

### Test Attachments

1. **With Attachments:**
   ```javascript
   const emailAttachments = [
     {
       filename: 'proposal.pdf',
       content: 'base64encodedcontent'
     }
   ];
   
   await fetch('/api/send-email', {
     method: 'POST',
     body: JSON.stringify({
       // ... other fields
       emailAttachments
     })
   });
   ```

2. **Without Attachments:**
   - Send email without `emailAttachments` parameter
   - Expected: Simple text email sent

### Test Template Variables

1. **With Variables:**
   ```javascript
   const template = {
     subject: "Hello {{first_name}} from {{business_name}}",
     body: "Hi {{first_name}},\n\nI noticed {{business_name}}..."
   };
   
   await fetch('/api/send-email', {
     method: 'POST',
     body: JSON.stringify({
       // ... other fields
       template
     })
   });
   ```

2. **Expected Output:**
   - Subject: "Hello John from Acme Corp"
   - Body: "Hi John,\n\nI noticed Acme Corp..."

## Configuration

### Adjust Duplicate Time Windows

Edit `app/api/send-email/route.js`:

```javascript
// Initial email window (currently 24 hours)
const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

// Follow-up window (currently 1 hour)
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
```

### Attachment File Types

The current implementation uses `application/octet-stream` for all attachments. To support specific file types:

```javascript
// Add content type detection
const getContentType = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  const types = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'png': 'image/png',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  return types[ext] || 'application/octet-stream';
};

// Use in attachment loop
message += `Content-Type: ${getContentType(filename)}\r\n`;
```

## Business Value

### Before Fixes
- ❌ Duplicate emails sent to same contacts
- ❌ Spam risk from repeated sends
- ❌ Wasted quota on duplicates
- ❌ Attachments not working
- ❌ Template variables appearing as literal text ({{business_name}})
- ❌ Unprofessional email appearance
- ❌ Dynamic templates incomplete

### After Fixes
- ✅ No duplicate emails (24-hour window)
- ✅ No duplicate follow-ups (1-hour window)
- ✅ Attachments work correctly
- ✅ Template variables properly replaced with actual data
- ✅ Professional, personalized emails
- ✅ Dynamic templates fully functional
- ✅ Clear error messages
- ✅ Better user experience

## Files Modified

- `app/api/send-email/route.js` - Enhanced duplicate prevention and attachment support
- `DUPLICATE_PREVENTION_FIX.md` - This documentation

## Summary

**Duplicate Prevention:**
- Initial emails: 24-hour window
- Follow-ups: 1-hour window
- Firebase query-based checking
- Clear error messages

**Attachment Support:**
- Enhanced MIME message creation
- Multiple attachments per email
- Proper encoding
- Backward compatible (works without attachments)

**Template Variable Substitution:**
- Comprehensive variable name support (15+ variations)
- Fuzzy matching for unrecognized patterns
- Helper function for maintainability
- Applied to both CSV and follow-up sending
- Case-insensitive replacement
- Professional, personalized emails

**All three issues now resolved.**
