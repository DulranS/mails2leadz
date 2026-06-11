# Firebase Setup Instructions

To enable Google Sign-In for your Auto-Leads dashboard, you need to configure Firebase environment variables.

## 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing one
3. Enable Authentication → Sign-in method → Google

## 2. Required Environment Variables
Create a `.env.local` file in your project root with these variables:

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

## 3. Where to Find These Values
In Firebase Console → Project Settings → General:
- **API Key**: Web API Key
- **Auth Domain**: Your project's auth domain
- **Project ID**: Your project ID
- **Storage Bucket**: Cloud Storage bucket name
- **Messaging Sender ID**: Cloud Messaging sender ID
- **App ID**: Web app ID
- **Measurement ID**: Google Analytics measurement ID

## 4. Enable Google Authentication
1. Firebase Console → Authentication → Sign-in method
2. Enable Google provider
3. Add your domain (localhost:3000 for development)
4. Copy OAuth client ID if needed

## 5. Restart Development Server
After adding the `.env.local` file, restart your dev server:
```bash
npm run dev
```

The dashboard will then show a functional "Sign in with Google" button instead of the configuration warning.
