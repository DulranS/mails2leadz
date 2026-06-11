import { logWarn, logError } from './logger';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableStatus = (status) => status === 429 || status >= 500;

export async function fetchWithRetry(url, options = {}, { retries = 2, retryDelayMs = 700, timeoutMs = 30_000 } = {}) {
  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!isRetryableStatus(response.status)) {
        return response;
      }

      if (attempt > retries) {
        return response;
      }

      logWarn(`Retrying request after retryable status ${response.status}`, {
        url,
        attempt,
        status: response.status
      });
      await delay(retryDelayMs);
    } catch (error) {
      clearTimeout(timer);
      lastError = error;

      if (error.name === 'AbortError') {
        logWarn('Request aborted by timeout', { url, timeoutMs, attempt });
      } else {
        logWarn('Request failed, will retry if possible', { url, attempt, error: error.message });
      }

      if (attempt > retries) {
        logError('Request failed after retry attempts', error);
        throw error;
      }

      await delay(retryDelayMs);
    }
  }

  throw lastError || new Error('fetchWithRetry failed without a specific error');
}
