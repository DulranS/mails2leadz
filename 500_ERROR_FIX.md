# 🚨 **500 SERVER ERROR - DIAGNOSIS & FIX**

## 🔍 **Most Common Cause: Missing Environment Variables**

The 500 error is almost certainly caused by missing environment variables in your `.env.local` file.

## 🛠️ **IMMEDIATE FIX**

Create `.env.local` file in your project root with these variables:

```env
# Firebase Configuration (get from Firebase Console)
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id_here
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id_here

# Google OAuth (get from Google Cloud Console)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id_here
NEXT_PUBLIC_GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Gmail Configuration
GMAIL_SENDER_EMAIL=your_email@gmail.com
```

## 🧪 **DEBUG STEPS**

### 1. Check Browser Console
Open browser console (F12) and look for:
- Failed API calls
- Specific error messages
- Which endpoint is failing

### 2. Check Network Tab
1. Open DevTools → Network tab
2. Try the follow-up action
3. Look for red (failed) requests
4. Click on failed request to see details

### 3. Test Specific Endpoints
Test these URLs directly in browser:
- `http://localhost:3000/api/list-sent-leads`
- `http://localhost:3000/api/get-daily-count`

## 🎯 **Common 500 Error Causes**

### 1. Missing Environment Variables (90% of cases)
- Firebase configuration missing
- Google OAuth credentials missing
- Gmail sender email not set

### 2. Firebase Connection Issues
- Invalid Firebase project ID
- Firebase rules blocking access
- Network connectivity issues

### 3. Google OAuth Issues
- Invalid client ID
- OAuth redirect URI mismatch
- Gmail API not enabled

## 📋 **Where to Get Environment Variables**

### Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Project Settings → General
4. Copy API Key, Auth Domain, Project ID, App ID

### Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. APIs & Services → Credentials
3. Create OAuth 2.0 Client ID
4. Copy Client ID and Client Secret
5. Add redirect URI: `http://localhost:3000`

## 🚀 **After Fixing**

1. **Restart application**: `npm run dev`
2. **Clear browser cache**: Ctrl+Shift+R
3. **Test follow-up functionality**

## 🔧 **If Still Getting 500 Errors**

1. Check the terminal output for server errors
2. Verify all environment variables are set correctly
3. Ensure Firebase and Google Cloud projects are properly configured
4. Check if APIs are enabled in Google Cloud Console

The most likely fix is adding the missing environment variables to `.env.local` file!
