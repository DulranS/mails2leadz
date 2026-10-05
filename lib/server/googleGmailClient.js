import { google } from 'googleapis';
import { createLogger } from '../logger';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } from '../config';
import { ApiError } from '../errors';

const logger = createLogger('googleGmailClient');

const requireGoogleConfig = () => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new ApiError('Google OAuth client configuration is missing', {
      status: 500,
      code: 'GOOGLE_CONFIG_ERROR',
      details: {
        clientId: Boolean(GOOGLE_CLIENT_ID),
        clientSecret: Boolean(GOOGLE_CLIENT_SECRET)
      }
    });
  }
};

export const createGmailClient = async (credentials = {}) => {
  requireGoogleConfig();

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
  );

  oauth2Client.setCredentials({
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token,
    expiry_date: credentials.expires_at || credentials.expiryDate || null
  });

  const needsRefresh = credentials.expires_at && new Date(credentials.expires_at) <= new Date();
  if (needsRefresh) {
    try {
      logger.info('Access token expired, refreshing Google OAuth token', {
        email: credentials.email || 'unknown'
      });
      const { credentials: refreshed } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(refreshed);
    } catch (error) {
      logger.error('Failed to refresh Google access token', error);
      throw new ApiError('Failed to refresh Google access token', {
        status: 401,
        code: 'GOOGLE_TOKEN_REFRESH_FAILED',
        details: error.message
      });
    }
  }

  return google.gmail({ version: 'v1', auth: oauth2Client });
};
