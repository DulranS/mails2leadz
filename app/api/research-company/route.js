// app/api/research-company/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

// ============================================================================
// OPENAI CONFIGURATION
// ============================================================================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// ============================================================================
// POST HANDLER
// ============================================================================
export async function POST(request) {
  try {
    const { companyName, companyWebsite, defaultEmailTemplate, userId } = await request.json();
    
    if (!companyName || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Call OpenAI for research
    const researchPrompt = `You are a B2B sales research assistant. Research this company and provide:
1. General value proposition for our services (web dev, AI automation, digital ops)
2. Personalized email subject and body
3. Key research notes

Company: ${companyName}
Website: ${companyWebsite || 'Not provided'}

Provide JSON response with: generalIdea {service, valueProposition, targetAudience}, personalizedEmail {subject, body, researchNotes}`;

    const openaiResponse = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: 'You are a B2B sales research expert. Provide actionable insights in JSON format.' },
          { role: 'user', content: researchPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });
    
    const openaiData = await openaiResponse.json();
    
    if (!openaiData.choices || !openaiData.choices[0]) {
      throw new Error('OpenAI API error');
    }
    
    const researchContent = openaiData.choices[0].message.content;
    
    // Parse AI response (extract JSON)
    let researchResult;
    try {
      const jsonMatch = researchContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        researchResult = JSON.parse(jsonMatch[0]);
      } else {
        researchResult = {
          generalIdea: {
            service: 'Digital operations support',
            valueProposition: 'Reduce operational costs by 40%',
            targetAudience: 'Small to mid-sized businesses'
          },
          personalizedEmail: {
            subject: `Quick question for ${companyName}`,
            body: defaultEmailTemplate || 'Hi, would you be interested in our services?',
            researchNotes: researchContent
          }
        };
      }
    } catch (e) {
      researchResult = {
        generalIdea: {
          service: 'Digital operations support',
          valueProposition: 'Reduce operational costs',
          targetAudience: 'Businesses like yours'
        },
        personalizedEmail: {
          subject: `Quick question for ${companyName}`,
          body: defaultEmailTemplate || 'Hi, would you be interested?',
          researchNotes: researchContent
        }
      };
    }
    
    // Save research to Firebase
    await addDoc(collection(db, 'company_research'), {
      userId,
      companyName,
      companyWebsite,
      result: researchResult,
      createdAt: new Date().toISOString()
    });
    
    return NextResponse.json({
      companyName,
      ...researchResult
    });
    
  } catch (error) {
    console.error('Research company error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to research company',
        details: error.message,
        generalIdea: {
          service: 'Digital operations support',
          valueProposition: 'Reduce operational costs',
          targetAudience: 'Businesses like yours'
        },
        personalizedEmail: {
          subject: 'Quick question',
          body: 'Would you be interested in our services?',
          researchNotes: 'Research failed - using default'
        }
      },
      { status: 200 }
    );
  }
}