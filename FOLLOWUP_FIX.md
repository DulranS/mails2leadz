# Follow-Up Issues - Quick Fix Guide

## 🚨 IMMEDIATE STEPS TO FIX FOLLOW-UPS

### Step 1: Check Environment Variables
Create `.env.local` file in the root folder with these variables:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id

# Google OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id_here
NEXT_PUBLIC_GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Gmail Configuration
GMAIL_SENDER_EMAIL=your_email@gmail.com
```

### Step 2: Test the Issues
1. Open your application
2. Go to the Follow-Up modal
3. Open browser console (F12)
4. Run this diagnostic:
   ```javascript
   // Copy and paste this in console
   fetch('/public/diagnose.js').then(r => r.text()).then(code => eval(code));
   ```

### Step 3: Common Fixes

#### Issue: "Google Client ID missing"
**Fix**: Add `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to `.env.local`

#### Issue: "Firebase not initialized"
**Fix**: Add Firebase variables to `.env.local`

#### Issue: "No access token received"
**Fix**: 
1. Check Google Cloud Console
2. Enable Gmail API
3. Set redirect URI to `http://localhost:3000`

#### Issue: "API not found"
**Fix**: Ensure `app/api/send-followup/route.js` exists

### Step 4: Manual Testing
1. Click "🔍 Debug Info" in Follow-Up modal
2. Click "🧪 Test Single Follow-Up"
3. Check console for specific error messages

## 🔧 Most Common Problems

### 1. Missing Environment Variables (90% of cases)
- Create `.env.local` file
- Add all required variables
- Restart the application

### 2. Gmail OAuth Not Configured
- Go to Google Cloud Console
- Enable Gmail API
- Create OAuth 2.0 credentials
- Set correct redirect URI

### 3. CORS Issues
- Ensure running on `http://localhost:3000`
- Check browser doesn't block popups

## 📞 If Still Not Working

1. **Check Console Logs**: Look for specific error messages
2. **Verify Environment**: All variables in `.env.local`
3. **Test API**: Try calling `/api/send-followup` directly
4. **Check Network**: Look for failed requests in Network tab

## 🚀 Quick Test
Run this in browser console:
```javascript
// Test if environment variables are loaded
console.log('Google Client ID:', process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? '✅' : '❌ Missing');
console.log('Firebase API Key:', process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✅' : '❌ Missing');
```
