import { NextResponse } from 'next/server';
import { createLogger } from './logger';
import { ApiError, isApiError } from './errors';

const logger = createLogger('apiResponse');

export const jsonResponse = (payload, status = 200, headers = {}) =>
  NextResponse.json(payload, { status, headers });

export const successResponse = (data = {}, status = 200, headers = {}) =>
  jsonResponse({ success: true, ...data }, status, headers);

export const errorResponse = (error) => {
  if (isApiError(error)) {
    return jsonResponse(
      {
        success: false,
        error: error.message,
        code: error.code,
        details: error.details || null
      },
      error.status,
      { 'Content-Type': 'application/json' }
    );
  }

  logger.error('Unhandled API error', error);
  return jsonResponse(
    {
      success: false,
      error: error?.message || 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
      details: process.env.NODE_ENV !== 'production' ? error : null
    },
    500,
    { 'Content-Type': 'application/json' }
  );
};

export const withApiHandler = (handler, context = 'api') => {
  const routeLogger = createLogger(context);
  return async (request) => {
    try {
      const result = await handler(request);
      if (result instanceof Response) return result;
      return successResponse(result);
    } catch (error) {
      routeLogger.error('Request failed', error);
      return errorResponse(error);
    }
  };
};
