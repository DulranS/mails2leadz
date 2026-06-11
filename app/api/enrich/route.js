import { enrichCsv } from '../../../lib/services/enrichService';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('enrichRoute');

export async function POST(request) {
  try {
    const csvBody = await request.text();
    const { text, contentDisposition } = await enrichCsv(csvBody);

    const headers = new Headers({
      'Content-Type': 'text/csv; charset=utf-8'
    });

    if (contentDisposition) {
      headers.set('Content-Disposition', contentDisposition);
    }

    return new Response(text, {
      status: 200,
      headers
    });
  } catch (error) {
    logger.error('Enrich proxy failed', error);
    return new Response(`Failed to enrich CSV: ${error?.message ?? 'Unknown error'}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}
