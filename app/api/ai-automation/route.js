// app/api/ai-automation/route.js
import { NextResponse } from 'next/server';
import { CodeAutomationAgent } from '../../../lib/ai/CodeAutomationAgent.js';

// Initialize agent instance
let agentInstance = null;

function getAgent() {
  if (!agentInstance) {
    agentInstance = new CodeAutomationAgent({
      maxIterations: 5,
      maxErrors: 3,
      timeout: 30000,
      contextConfig: {
        maxTokens: 128000,
        reserveTokens: 4000,
        compressionThreshold: 0.8
      },
      cacheConfig: {
        maxSize: 1000,
        defaultTTL: 3600000,
        enableSemanticCache: true
      },
      costConfig: {
        budget: 100,
        budgetPeriod: 'month'
      }
    });
  }
  return agentInstance;
}

export async function POST(request) {
  try {
    const { action, code, language, requirements, bugDescription, docType, improvements } = await request.json();

    const agent = getAgent();
    let result;

    switch (action) {
      case 'make':
        result = await agent.make(requirements, language);
        break;
      case 'fix':
        result = await agent.fix(code, bugDescription, language);
        break;
      case 'doc':
        result = await agent.doc(code, docType);
        break;
      case 'detect':
        agent.state.context = { task: 'detect', code, language };
        result = await agent.run();
        break;
      case 'analyze':
        agent.state.context = { task: 'analyze', code, language };
        result = await agent.run();
        break;
      case 'refactor':
        agent.state.context = { task: 'refactor', code, improvements, language };
        result = await agent.run();
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: make, fix, doc, detect, analyze, refactor' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      action,
      result,
      stats: agent.getComprehensiveStats()
    });

  } catch (error) {
    console.error('AI Automation error:', error);
    return NextResponse.json(
      { error: error.message, details: error.stack },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const agent = getAgent();
    const stats = agent.getComprehensiveStats();

    return NextResponse.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('AI Stats error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
