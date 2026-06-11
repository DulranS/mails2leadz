export class ApiError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const isApiError = (error) => error instanceof ApiError;
