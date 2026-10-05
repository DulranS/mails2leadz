import { ENRICH_ENDPOINT, DEFAULT_ENRICH_TIMEOUT_MS, ENRICH_RETRY_COUNT, ENRICH_RETRY_DELAY_MS, ENABLE_ENRICH_PROXY } from '../config';
import { fetchWithRetry } from '../httpClient';
import { createLogger } from '../logger';

const logger = createLogger('enrichService');

const normalizeCsv = (csv) => {
  if (typeof csv !== 'string') return '';
  return csv.trim().replace(/\r\n/g, '\n');
};

const validateCsvBody = (csvBody) => {
  const normalized = normalizeCsv(csvBody);
  if (!normalized) {
    throw new Error('CSV body is required and cannot be empty.');
  }

  if (!normalized.includes('\n')) {
    throw new Error('CSV body must include at least one header row and one record row.');
  }

  const header = normalized.split('\n')[0];
  if (!header.includes(',') && !header.includes(';')) {
    logger.warn('CSV header does not contain commas or semicolons.', { header });
  }

  return normalized;
};

const buildContentDisposition = () => 'attachment; filename="enriched-leads.csv"';

export async function enrichCsv(csvBody) {
  if (!ENABLE_ENRICH_PROXY) {
    throw new Error('CSV enrichment proxy is disabled by feature flag.');
  }

  const body = validateCsvBody(csvBody);
  if (!ENRICH_ENDPOINT) {
    throw new Error('ENRICH_ENDPOINT is not configured. Set the environment variable and retry.');
  }

  logger.info('Starting CSV enrichment request', {
    endpoint: ENRICH_ENDPOINT,
    rowCount: body.split('\n').length - 1
  });

  const response = await fetchWithRetry(ENRICH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/csv'
    },
    body
  }, {
    retries: ENRICH_RETRY_COUNT,
    retryDelayMs: ENRICH_RETRY_DELAY_MS,
    timeoutMs: DEFAULT_ENRICH_TIMEOUT_MS
  });

  const enrichedCsv = await response.text();
  const contentDisposition = response.headers.get('content-disposition') || buildContentDisposition();

  if (!response.ok) {
    logger.error('Upstream enrichment service returned error', {
      status: response.status,
      statusText: response.statusText,
      bodyPreview: enrichedCsv.slice(0, 512)
    });
    throw new Error(`Enrichment service returned ${response.status}: ${response.statusText}`);
  }

  logger.info('CSV enrichment completed successfully', {
    status: response.status,
    bytes: new TextEncoder().encode(enrichedCsv).length
  });

  return {
    text: enrichedCsv,
    contentDisposition
  };
}
