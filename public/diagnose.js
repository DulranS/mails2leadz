// Quick Diagnostic Script for Follow-Up Issues
// Run this in browser console when on the dashboard

(async function diagnoseFollowUpIssues() {
  console.log('🔍 Starting Follow-Up Diagnosis...\n');
  
  // Test 1: Environment Variables Check
  console.log('📋 1. Checking Environment Variables:');
  console.log('NEXT_PUBLIC_GOOGLE_CLIENT_ID:', process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing');
  console.log('GMAIL_SENDER_EMAIL:', process.env.GMAIL_SENDER_EMAIL ? '✅ Set' : '❌ Missing');
  
  // Test 2: Google OAuth Check
  console.log('\n🔐 2. Checking Google OAuth:');
  if (typeof window !== 'undefined' && window.google) {
    console.log('Google API loaded: ✅');
    console.log('OAuth2 available:', window.google.accounts?.oauth2 ? '✅' : '❌');
  } else {
    console.log('Google API not loaded: ❌');
  }
  
  // Test 3: User Authentication Check
  console.log('\n👤 3. Checking User Authentication:');
  const user = await new Promise(resolve => {
    if (typeof window !== 'undefined' && window.auth) {
      window.auth.onAuthStateChanged(resolve);
    } else {
      resolve(null);
    }
  });
  console.log('User authenticated:', user ? '✅' : '❌');
  console.log('User UID:', user?.uid || '❌ None');
  
  // Test 4: Test API Endpoint
  console.log('\n📡 4. Testing API Endpoint:');
  try {
    const response = await fetch('/api/send-followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        accessToken: 'test_token',
        userId: user?.uid,
        senderName: 'Test'
      })
    });
    console.log('API Response Status:', response.status);
    const data = await response.json();
    console.log('API Response:', data);
    console.log('API working:', response.ok ? '✅' : '❌');
  } catch (error) {
    console.log('API Error:', error.message);
    console.log('API working: ❌');
  }
  
  // Test 5: Check Safe Candidates
  console.log('\n📊 5. Checking Safe Candidates:');
  if (typeof window !== 'undefined' && window.getSafeFollowUpCandidates) {
    const candidates = window.getSafeFollowUpCandidates();
    console.log('Safe candidates found:', candidates.length);
    console.log('Candidates:', candidates.slice(0, 3)); // Show first 3
  } else {
    console.log('getSafeFollowUpCandidates function not available: ❌');
  }
  
  console.log('\n🎯 Diagnosis Complete!');
  console.log('If you see ❌ marks above, those are the issues to fix.');
})();
