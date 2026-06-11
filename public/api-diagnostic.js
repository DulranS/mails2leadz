// API Diagnostic Tool
// Run this in browser console to identify which API is causing 500 errors

(async function diagnoseAPIs() {
  console.log('🔍 Diagnosing API endpoints...\n');
  
  const endpoints = [
    '/api/list-sent-leads',
    '/api/get-daily-count',
    '/api/send-followup',
    '/api/send-new-leads'
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`📡 Testing ${endpoint}...`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test' })
      });
      
      console.log(`✅ ${endpoint}: ${response.status}`);
      
      if (!response.ok) {
        const error = await response.text();
        console.log(`❌ Error details:`, error);
      }
    } catch (error) {
      console.log(`💥 ${endpoint} failed:`, error.message);
    }
  }
  
  console.log('\n🎯 Diagnosis complete!');
  console.log('Look for 500 status codes above to identify the failing endpoint');
})();
