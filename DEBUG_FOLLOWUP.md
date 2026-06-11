# Follow-Up Debugging Guide

## Common Issues & Solutions

### 1. Environment Variables Missing
Check these environment variables in `.env.local`:
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
NEXT_PUBLIC_GOOGLE_CLIENT_SECRET=your_google_client_secret
GMAIL_SENDER_EMAIL=your_email@gmail.com
```

### 2. Gmail OAuth Setup
- Ensure Google Client ID is configured in Google Cloud Console
- Check that Gmail API is enabled
- Verify redirect URI is set to `http://localhost:3000`

### 3. Firebase Configuration
- Ensure Firestore rules allow read/write access
- Check that Firebase is properly initialized
- Verify user authentication is working

### 4. Debug Steps
1. Open browser console (F12)
2. Go to Follow-Up modal
3. Click "🔍 Debug Info" button
4. Check console output for errors
5. Click "🧪 Test Single Follow-Up" button
6. Monitor console logs for each step

### 5. Common Console Errors
- "Google Client ID missing" → Check environment variables
- "Firebase not properly initialized" → Check Firebase config
- "No access token received" → Check Gmail OAuth setup
- "Failed to send follow-up" → Check API endpoint

### 6. API Endpoint Issues
Check `/api/send-followup` endpoint:
- Should return JSON responses
- Handle Gmail API errors properly
- Update Firebase correctly

### 7. Browser Issues
- Clear browser cache
- Disable ad blockers
- Check popup blockers for OAuth
- Ensure third-party cookies enabled

## Testing Steps

1. **Basic Setup Test**
   - Sign in to the application
   - Check if user authentication works
   - Verify Firebase connection

2. **Gmail OAuth Test**
   - Click "Test Single Follow-Up"
   - Check if Gmail OAuth popup appears
   - Verify token is received

3. **API Test**
   - Monitor API calls in Network tab
   - Check `/api/send-followup` responses
   - Verify error handling

4. **Mass Email Test**
   - Ensure safe candidates exist
   - Check quota system
   - Test batch processing

## Quick Fix Checklist

- [ ] Environment variables set correctly
- [ ] Gmail OAuth configured
- [ ] Firebase rules allow access
- [ ] User can authenticate
- [ ] Gmail token can be obtained
- [ ] API endpoints respond correctly
- [ ] Follow-up candidates are identified
- [ ] Mass email button appears
- [ ] Test follow-up sends successfully
