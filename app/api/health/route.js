import { validateRequiredEnv, ENRICH_ENDPOINT, ENABLE_ENRICH_PROXY, ENVIRONMENT, SERVICE_NAME } from '../../../lib/config';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('healthRoute');

export async function GET() {
  try {
    const missing = validateRequiredEnv();
    const health = {
      service: SERVICE_NAME,
      environment: ENVIRONMENT,
      timestamp: new Date().toISOString(),
      enrichProxy: ENABLE_ENRICH_PROXY,
      enrichEndpoint: Boolean(ENRICH_ENDPOINT),
      requiredEnvironmentVariablesPresent: missing.length === 0,
      missingVariables: missing
    };

    logger.info('Health check requested', health);

    return new Response(JSON.stringify(health, null, 2), {
      status: missing.length === 0 ? 200 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logger.error('Health check failed', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
