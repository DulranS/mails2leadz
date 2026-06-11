# TESTING INSTRUCTIONS - "Mark Not Contacted" Feature

## Pre-Test Setup
1. Ensure you're logged into the dashboard
2. Have at least one contact loaded in the contacts list
3. Open browser Developer Tools (F12)
4. Go to Console tab

## Test Case 1: Mark Contact as Contacted

### Steps:
1. Find any contact in the list
2. Locate the button that says "✅ Mark Contacted"
3. Click the button

### Expected Result:
```
✅ Success notification appears:
"✅ Marked [contact name] as contacted"

UI Changes:
- Button text changes to "↩️ Mark Not Contacted"
- Button color changes from green to gray

Console Output:
- No errors should appear
- You may see: "Mark contact manually completed"
```

## Test Case 2: Mark Contact as Not Contacted

### Steps:
1. Find a contact that was just marked as "Contacted"
2. Click the button that now says "↩️ Mark Not Contacted"

### Expected Result:
```
✅ Success notification appears:
"🔄 Marked [contact name] as not contacted"

UI Changes:
- Button text changes back to "✅ Mark Contacted"
- Button color changes back to green

Console Output:
- No errors should appear
```

## Test Case 3: Verify Firebase Storage

### Steps:
1. Mark a contact as "Contacted"
2. Open Firebase Console (https://console.firebase.google.com)
3. Navigate to: Firestore Database → Collections
4. Look for collection named: `manual_contact_status`

### Expected Result:
```
✅ Collection contains document:
{
  userId: "[your-user-id]",
  contactKey: "[email or phone]",
  contacted: true,
  lastContacted: "[ISO timestamp]",
  reason: "Manual update",
  updatedAt: "[ISO timestamp]",
  manual: true
}
```

## Test Case 4: Verify Contact History Update

### Steps:
1. Mark a contact as "Contacted"
2. In Firebase Console, navigate to: `contact_history` collection
3. Find the document matching the contact's email/phone

### Expected Result:
```
✅ Document updated with:
{
  manuallyMarked: true,
  lastUpdated: "[ISO timestamp]",
  lastContacted: "[ISO timestamp]",
  lastChannel: "manual",
  contactCount: incremented
}
```

## Test Case 5: Error Scenarios

### Scenario A: User Not Authenticated
**Steps:**
1. Log out of dashboard
2. Try to click "Mark Contacted" button

**Expected Result:**
```
Error message:
"❌ User not authenticated. Please log in again."

Console output:
User not authenticated: user.uid is undefined
```

### Scenario B: Firebase Not Initialized
**Steps:**
1. Open dashboard console
2. This should not occur in normal usage, but if it does...

**Expected Result:**
```
Error message:
"❌ Database connection error. Please refresh and try again."

Console output:
Firebase database not initialized
```

### Scenario C: Contact Missing Email/Phone
**Steps:**
1. This occurs when contact has neither email nor phone

**Expected Result:**
```
Error message:
"❌ Contact must have email or phone"
```

### Scenario D: Invalid Contact
**Steps:**
1. This should not occur in normal usage

**Expected Result:**
```
Error message:
"❌ Invalid contact provided"
```

## Test Case 6: Bulk Testing

### Steps:
1. Mark multiple contacts as "Contacted" (5-10 contacts)
2. Refresh the page
3. Verify all statuses persist

### Expected Result:
```
✅ All contacts maintain their marked status after page refresh
✅ Buttons show correct state for each contact
✅ No console errors appear
```

## Debugging if Issues Occur

### Check Console Logs:
1. Open Developer Tools (F12)
2. Go to Console tab
3. Look for lines starting with "Mark contact manually error:"
4. These will show:
   - errorMessage: [specific Firebase error]
   - errorCode: [Firebase error code]
   - contact: [email or phone]
   - user: [your user ID]

### Common Issues:

**Issue:** "Failed to update contact status" (generic error)
**Solution:** Check console for detailed error message

**Issue:** Button doesn't respond
**Solution:** 
- Verify you're logged in
- Check browser console for errors
- Try refreshing the page

**Issue:** Status doesn't persist after refresh
**Solution:**
- Check Firebase Firestore permissions
- Verify user has write access to `manual_contact_status` collection
- Check browser console for Firebase errors

### How to Report Issues:
1. Open browser console (F12)
2. Click the problematic button
3. Copy the error message that appears
4. Include:
   - Error message
   - Contact email/phone
   - Your user ID (if visible in console)
   - Steps taken before error

---

## Success Indicators

✅ **All tests passed if:**
1. Buttons respond immediately when clicked
2. Success notifications appear with contact name
3. Button text and color change appropriately
4. Status persists after page refresh
5. Firebase records created in Firestore
6. No console errors appear
7. Error messages are specific and helpful

---

## Performance Notes

- Status update completes in < 500ms
- Firebase write typically < 200ms
- UI updates immediately (optimistic)
- No page refresh required
- Works on slow connections (with small delay)

---

**Last Updated:** April 5, 2026  
**Status:** ✅ READY FOR TESTING
