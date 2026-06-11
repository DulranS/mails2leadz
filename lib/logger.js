const timestamp = () => new Date().toISOString();

const formatMessage = (level, message, meta) => {
  const prefix = `[${timestamp()}] [${level}]`;
  if (!meta) return `${prefix} ${message}`;

  const detail = typeof meta === 'string' ? meta : JSON.stringify(meta, null, 2);
  return `${prefix} ${message} | ${detail}`;
};

export const logInfo = (message, meta) => {
  console.info(formatMessage('INFO', message, meta));
};

export const logWarn = (message, meta) => {
  console.warn(formatMessage('WARN', message, meta));
};

export const logError = (message, error) => {
  const meta = error instanceof Error ? { message: error.message, stack: error.stack } : error;
  console.error(formatMessage('ERROR', message, meta));
};

export const createLogger = (context) => ({
  info: (message, meta) => logInfo(`${context} | ${message}`, meta),
  warn: (message, meta) => logWarn(`${context} | ${message}`, meta),
  error: (message, error) => logError(`${context} | ${message}`, error)
});
