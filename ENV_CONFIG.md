# Environment Variables Configuration

## Required Environment Variables

### Firebase Configuration
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

### Gmail API Configuration
```env
GMAIL_CLIENT_ID=your_gmail_client_id
GMAIL_CLIENT_SECRET=your_gmail_client_secret
GMAIL_SENDER_EMAIL=your_email@gmail.com
```

### OpenAI Configuration (for AI features)
```env
OPENAI_API_KEY=your_openai_api_key
```

### Twilio Configuration (for SMS features)
```env
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
```

### Application Configuration
```env
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NODE_ENV=production
```

### Rate Limiting Configuration
```env
MAX_DAILY_EMAILS=500
RATE_LIMIT_DELAY_MS=5000
AUTO_CLEANUP_DAYS=30
```

### Business Configuration
```env
DEFAULT_AVG_DEAL_VALUE=5000
DEFAULT_DEMO_RATE=0.4
DEFAULT_CLOSE_RATE=0.15
```

## Setup Instructions

### 1. Firebase Setup
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing
3. Enable Firestore Database
4. Enable Authentication (Email/Password)
5. Go to Project Settings → General → Your apps → Web app
6. Copy the configuration values

### 2. Gmail API Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API
4. Go to Credentials → Create Credentials → OAuth client ID
5. Set up OAuth consent screen
6. Copy Client ID and Client Secret
7. Use OAuth Playground to get refresh token

### 3. OpenAI Setup (Optional - for AI features)
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an API key
3. Copy the API key

### 4. Twilio Setup (Optional - for SMS features)
1. Go to [Twilio Console](https://console.twilio.com/)
2. Get Account SID and Auth Token
3. Purchase a phone number
4. Copy the values

### 5. Create .env.local File
Create a `.env.local` file in the root directory and add all the required variables.

## Security Notes

- **Never commit .env.local to version control**
- **Use different API keys for development and production**
- **Rotate API keys regularly**
- **Use environment-specific configurations**
- **Enable Firebase security rules**
- **Use OAuth 2.0 for Gmail authentication**

## Production Deployment

### Vercel Deployment
1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Manual Deployment
1. Build the application: `npm run build`
2. Start production server: `npm start`
3. Set environment variables on your server
4. Use a process manager like PM2

## Troubleshooting

### Firebase Connection Issues
- Verify API key is correct
- Check Firebase project is not in test mode
- Ensure Firestore rules allow read/write access

### Gmail API Issues
- Verify OAuth credentials are correct
- Check refresh token is valid
- Ensure OAuth consent screen is configured

### Rate Limiting
- Adjust MAX_DAILY_EMAILS based on Gmail limits
- Increase RATE_LIMIT_DELAY_MS if hitting rate limits
- Monitor Gmail API quota usage
