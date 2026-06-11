# Firestore Security Rules

## For Firebase Client SDK (with authentication)

If you want to use the client SDK with authentication, use these rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write for authenticated users on their own data
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Allow read/write for authenticated users on their own sent emails
    match /sent_emails/{document} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
    }
    
    // Allow read/write for authenticated users on their own deals
    match /deals/{document} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
    }
    
    // Allow read/write for authenticated users on their own contact history
    match /users/{userId}/contact_history/{document} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Deny all other requests
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## For Development (Open access - NOT recommended for production)

For quick testing, you can use open access (NOT for production):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

## Recommended: Use Firebase Admin SDK

For production, use Firebase Admin SDK with these environment variables in `.env.local`:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
```

To get these:
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Download the JSON file
4. Copy the values to your `.env.local`

Then the API will bypass security rules entirely.
