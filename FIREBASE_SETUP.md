# Firebase Setup Guide

## Required Environment Variables

Create a `.env.local` file in the root directory with these variables:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

## Setup Steps

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing
3. Enable Authentication:
   - Go to Authentication → Sign-in method
   - Enable Google provider
   - Add your domain to authorized domains
4. Create Firestore Database:
   - Go to Firestore Database → Create database
   - Start in test mode (for development)
   - Choose a location
5. Get your config values from Project Settings → Web apps
6. Add the values to `.env.local`

## Firestore Security Rules

Add these rules in Firestore → Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own contacts
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Test the System

1. Import the sample CSV file: `sample-leads.csv`
2. Check if contacts appear in the database
3. Try running a campaign
4. Monitor the browser console for debug information
