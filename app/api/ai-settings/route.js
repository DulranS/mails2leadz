// app/api/ai-settings/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseClient';

// ============================================================================
// GET HANDLER - FETCH AI SETTINGS
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
    
    const { data, error } = await supabaseAdmin
      .from('ai_settings')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }
    
    // Return default settings if none exist
    const defaultSettings = {
      user_id: userId,
      auto_reply_enabled: true,
      auto_followup_enabled: true,
      max_followups_per_lead: 3,
      reply_delay_minutes: 5,
      followup_intervals: {
        hot_lead: [1, 3, 7],
        warm_lead: [3, 7, 14],
        cold_lead: [7, 14, 30],
        information_request: [2, 5, 10],
        ooo_followup: [7, 14, 21]
      },
      working_hours_start: '09:00:00',
      working_hours_end: '17:00:00',
      timezone: 'UTC',
      custom_instructions: ''
    };
    
    return NextResponse.json({
      success: true,
      settings: data || defaultSettings
    });
    
  } catch (error) {
    console.error('[AI Settings] GET error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch AI settings',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST HANDLER - UPDATE AI SETTINGS
// ============================================================================
export async function POST(request) {
  try {
    const settings = await request.json();
    const { user_id, ...settingsData } = settings;
    
    if (!user_id) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    // Validate settings
    const validatedData = {
      user_id,
      auto_reply_enabled: Boolean(settingsData.auto_reply_enabled),
      auto_followup_enabled: Boolean(settingsData.auto_followup_enabled),
      max_followups_per_lead: Math.max(1, Math.min(10, parseInt(settingsData.max_followups_per_lead) || 3)),
      reply_delay_minutes: Math.max(0, Math.min(60, parseInt(settingsData.reply_delay_minutes) || 5)),
      followup_intervals: settingsData.followup_intervals || {},
      working_hours_start: settingsData.working_hours_start || '09:00:00',
      working_hours_end: settingsData.working_hours_end || '17:00:00',
      timezone: settingsData.timezone || 'UTC',
      custom_instructions: settingsData.custom_instructions || ''
    };
    
    const { data, error } = await supabaseAdmin
      .from('ai_settings')
      .upsert(validatedData, {
        onConflict: 'user_id',
        returning: '*'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Log settings update
    await supabaseAdmin.from('ai_activity_log').insert({
      user_id,
      activity_type: 'settings_updated',
      activity_data: { old_settings: data, new_settings: validatedData },
      status: 'success'
    });
    
    return NextResponse.json({
      success: true,
      message: 'AI settings updated successfully',
      settings: data
    });
    
  } catch (error) {
    console.error('[AI Settings] POST error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update AI settings',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT HANDLER - RESET TO DEFAULTS
// ============================================================================
export async function PUT(request) {
  try {
    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    const defaultSettings = {
      user_id: userId,
      auto_reply_enabled: true,
      auto_followup_enabled: true,
      max_followups_per_lead: 3,
      reply_delay_minutes: 5,
      followup_intervals: {
        hot_lead: [1, 3, 7],
        warm_lead: [3, 7, 14],
        cold_lead: [7, 14, 30],
        information_request: [2, 5, 10],
        ooo_followup: [7, 14, 21]
      },
      working_hours_start: '09:00:00',
      working_hours_end: '17:00:00',
      timezone: 'UTC',
      custom_instructions: ''
    };
    
    const { data, error } = await supabaseAdmin
      .from('ai_settings')
      .upsert(defaultSettings, {
        onConflict: 'user_id',
        returning: '*'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Log settings reset
    await supabaseAdmin.from('ai_activity_log').insert({
      user_id: userId,
      activity_type: 'settings_reset',
      activity_data: { reset_to_defaults: true },
      status: 'success'
    });
    
    return NextResponse.json({
      success: true,
      message: 'AI settings reset to defaults',
      settings: data
    });
    
  } catch (error) {
    console.error('[AI Settings] PUT error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to reset AI settings',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
