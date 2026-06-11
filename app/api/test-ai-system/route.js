// app/api/test-ai-system/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseClient';
import { handleIncomingReply } from '../../../lib/ai-responder';

// ============================================================================
// TEST AI SYSTEM FUNCTIONALITY
// ============================================================================
export async function POST(request) {
  try {
    const { testType, userId, testData } = await request.json();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    let result;
    
    switch (testType) {
      case 'intent_classification':
        result = await testIntentClassification(testData);
        break;
        
      case 'ai_reply_generation':
        result = await testAIReplyGeneration(testData);
        break;
        
      case 'followup_scheduling':
        result = await testFollowupScheduling(userId, testData);
        break;
        
      case 'end_to_end':
        result = await testEndToEnd(userId, testData);
        break;
        
      default:
        return NextResponse.json(
          { error: 'Invalid test type' },
          { status: 400 }
        );
    }
    
    // Log test result
    await supabaseAdmin.from('ai_activity_log').insert({
      user_id: userId,
      activity_type: 'system_test',
      activity_data: { testType, testData, result },
      status: result.success ? 'success' : 'failed'
    });
    
    return NextResponse.json({
      success: true,
      testType,
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[AI System Test] Error:', error);
    return NextResponse.json(
      { 
        error: 'Test failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// TEST INTENT CLASSIFICATION
// ============================================================================
async function testIntentClassification(testData) {
  try {
    const { replyBody, lead } = testData;
    
    if (!replyBody || !lead) {
      throw new Error('replyBody and lead are required for intent classification test');
    }
    
    // Import the classifyIntent function
    const { classifyIntent } = await import('../../../lib/ai-responder');
    
    const startTime = Date.now();
    const classification = await classifyIntent(replyBody, lead);
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      classification,
      processingTime: `${duration}ms`,
      test: {
        replyBody: replyBody.substring(0, 100) + '...',
        leadEmail: lead.email,
        leadBusiness: lead.business_name
      }
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      test: testData
    };
  }
}

// ============================================================================
// TEST AI REPLY GENERATION
// ============================================================================
async function testAIReplyGeneration(testData) {
  try {
    const { intent, replyBody, lead, originalSubject } = testData;
    
    if (!intent || !replyBody || !lead) {
      throw new Error('intent, replyBody, and lead are required for AI reply generation test');
    }
    
    // Import the generateReplyForIntent function
    const { generateReplyForIntent } = await import('../../../lib/ai-responder');
    
    const startTime = Date.now();
    const reply = await generateReplyForIntent(intent, replyBody, lead, originalSubject);
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      reply,
      processingTime: `${duration}ms`,
      test: {
        intent,
        originalSubject,
        leadEmail: lead.email
      }
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      test: testData
    };
  }
}

// ============================================================================
// TEST FOLLOWUP SCHEDULING
// ============================================================================
async function testFollowupScheduling(userId, testData) {
  try {
    const { leadId, intent, replyBody } = testData;
    
    if (!leadId) {
      throw new Error('leadId is required for followup scheduling test');
    }
    
    // Create a test followup
    const followupData = {
      lead_id: leadId,
      scheduled_date: new Date().toISOString().slice(0, 10),
      follow_up_number: 1,
      status: 'pending',
      followup_type: intent === 'interested' ? 'hot_lead' : 'warm_lead',
      intent_context: intent,
      created_by: 'test_system'
    };
    
    const { data, error } = await supabaseAdmin
      .from('follow_up_schedule')
      .insert(followupData)
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      success: true,
      followup: data,
      test: {
        leadId,
        intent
      }
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      test: testData
    };
  }
}

// ============================================================================
// TEST END-TO-END FLOW
// ============================================================================
async function testEndToEnd(userId, testData) {
  try {
    const { leadId, testEmailContent } = testData;
    
    if (!leadId || !testEmailContent) {
      throw new Error('leadId and testEmailContent are required for end-to-end test');
    }
    
    // Get lead details
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();
    
    if (!lead) {
      throw new Error('Lead not found');
    }
    
    // Create test email thread entry
    const { data: thread } = await supabaseAdmin
      .from('email_threads')
      .insert({
        lead_id: leadId,
        gmail_thread_id: `test_thread_${Date.now()}`,
        gmail_message_id: `test_msg_${Date.now()}`,
        subject: 'Test Email for AI System',
        direction: 'received',
        body: testEmailContent,
        sent_at: new Date().toISOString(),
        processed: false
      })
      .select()
      .single();
    
    // Trigger auto-reply processor
    const processorResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/auto-reply-processor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const processorResult = await processorResponse.json();
    
    // Check if AI response was created
    const { data: aiResponse } = await supabaseAdmin
      .from('ai_responses')
      .select('*')
      .eq('lead_id', leadId)
      .eq('thread_id', thread.id)
      .single();
    
    // Check if followup was scheduled
    const { data: followup } = await supabaseAdmin
      .from('follow_up_schedule')
      .select('*')
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .single();
    
    return {
      success: true,
      testResults: {
        threadCreated: !!thread,
        processorResult,
        aiResponseCreated: !!aiResponse,
        followupScheduled: !!followup,
        aiResponse,
        followup
      },
      test: {
        leadId,
        testEmailContent: testEmailContent.substring(0, 100) + '...'
      }
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      test: testData
    };
  }
}

// ============================================================================
// GET HANDLER - SYSTEM HEALTH CHECK
// ============================================================================
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    // Check system components
    const checks = await Promise.allSettled([
      // Check database connection
      supabaseAdmin.from('leads').select('id').limit(1),
      
      // Check AI settings
      supabaseAdmin.from('ai_settings').select('*').eq('user_id', userId).single(),
      
      // Check user integrations
      supabaseAdmin.from('user_integrations').select('*').eq('user_id', userId).limit(1),
      
      // Check API endpoints
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/auto-reply-processor`),
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/followup-scheduler`)
    ]);
    
    const healthStatus = {
      database: checks[0].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      ai_settings: checks[1].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      user_integrations: checks[2].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      auto_reply_api: checks[3].status === 'fulfilled' && checks[3].value.ok ? 'healthy' : 'unhealthy',
      followup_api: checks[4].status === 'fulfilled' && checks[4].value.ok ? 'healthy' : 'unhealthy'
    };
    
    const overallHealth = Object.values(healthStatus).every(status => status === 'healthy') ? 'healthy' : 'degraded';
    
    return NextResponse.json({
      success: true,
      overallHealth,
      components: healthStatus,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[AI System Test] Health check error:', error);
    return NextResponse.json(
      { 
        error: 'Health check failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
