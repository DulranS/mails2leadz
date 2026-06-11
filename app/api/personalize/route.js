import { NextResponse } from 'next/server';

// AI personalization only - high ROI usage
export async function POST(req) {
  try {
    const { target, research } = await req.json();
    
    // Use Claude API only for high-value personalization
    const claudeKey = process.env.CLAUDE_API_KEY;
    
    if (!claudeKey) {
      // Fallback to template-based personalization
      return NextResponse.json({
        observation: `${target.business_name} is expanding rapidly`,
        impact: 'This creates urgency for scalable customer acquisition'
      });
    }
    
    const prompt = `Based on this company data, generate 2 short personalization bullets:

Company: ${target.business_name}
Industry: ${target.industry || 'SaaS'}
Research: ${research.headline}
Pain points: ${research.painPoints?.join(', ')}

Generate exactly:
1. One specific observation (15 words max)
2. One business impact (15 words max)

Format: {"observation": "...", "impact": "..."}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.content[0].text;
      
      try {
        const personalization = JSON.parse(content);
        return NextResponse.json(personalization);
      } catch {
        // Parse fallback if JSON fails
        const lines = content.split('\n').filter(line => line.trim());
        return NextResponse.json({
          observation: lines[0] || `${target.business_name} is expanding rapidly`,
          impact: lines[1] || 'This creates urgency for scalable customer acquisition'
        });
      }
    }
    
    // Fallback response
    return NextResponse.json({
      observation: `${target.business_name} shows strong growth indicators`,
      impact: 'Scaling customer acquisition is likely a priority'
    });
    
  } catch (error) {
    console.error('Personalization error:', error);
    
    // Always return a fallback
    return NextResponse.json({
      observation: 'Company is in rapid growth phase',
      impact: 'Customer acquisition scaling is critical'
    });
  }
}
