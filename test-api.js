import fetch from 'node-fetch';

async function testSendEmailAPI() {
  const testData = {
    userId: 'test-user',
    accessToken: 'invalid-token',
    csvContent: 'email,name\ninvalid-email,test',
    senderEmail: 'test@example.com',
    senderName: 'Test User',
    emailColumnName: 'email',
    businessColumnName: 'name',
    fieldMappings: {},
    refreshToken: 'invalid-refresh'
  };

  try {
    console.log('Testing send-email API with invalid data...');

    const response = await fetch('http://localhost:3000/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    const responseText = await response.text();
    console.log('Status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    try {
      const jsonResponse = JSON.parse(responseText);
      console.log('JSON Response:', JSON.stringify(jsonResponse, null, 2));
    } catch (parseError) {
      console.log('Response is not valid JSON!');
      console.log('Raw response:', responseText);
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testSendEmailAPI();