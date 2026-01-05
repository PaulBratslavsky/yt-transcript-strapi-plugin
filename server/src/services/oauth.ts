import type { Core } from '@strapi/strapi';

const PLUGIN_ID = 'plugin::yt-transcript-strapi-plugin';

export interface OAuthValidationResult {
  valid: boolean;
  clientId?: string;
  strapiApiToken?: string;
  error?: string;
}

const oauthService = ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Validate an OAuth access token and return the associated Strapi API token
   */
  async validateAccessToken(accessToken: string): Promise<OAuthValidationResult> {
    if (!accessToken) {
      return { valid: false, error: 'No access token provided' };
    }

    try {
      // Find the token
      const token = await strapi.documents(`${PLUGIN_ID}.oauth-token`).findFirst({
        filters: { accessToken, revoked: false },
      });

      if (!token) {
        return { valid: false, error: 'Invalid access token' };
      }

      // Check expiration
      if (new Date(token.expiresAt) < new Date()) {
        return { valid: false, error: 'Access token expired' };
      }

      // Get the client to retrieve the Strapi API token
      const client = await strapi.documents(`${PLUGIN_ID}.oauth-client`).findFirst({
        filters: { clientId: token.clientId, active: true },
      });

      if (!client) {
        return { valid: false, error: 'OAuth client not found or inactive' };
      }

      return {
        valid: true,
        clientId: token.clientId,
        strapiApiToken: client.strapiApiToken,
      };
    } catch (error) {
      strapi.log.error('[oauth] Error validating access token:', error);
      return { valid: false, error: 'Token validation failed' };
    }
  },

  /**
   * Clean up expired codes and tokens (call periodically)
   */
  async cleanupExpiredTokens(): Promise<{ deletedCodes: number; deletedTokens: number }> {
    const now = new Date().toISOString();

    // Delete expired and used authorization codes
    const expiredCodes = await strapi.documents(`${PLUGIN_ID}.oauth-code`).findMany({
      filters: {
        $or: [
          { expiresAt: { $lt: now } },
          { used: true },
        ],
      },
    });

    for (const code of expiredCodes) {
      await strapi.documents(`${PLUGIN_ID}.oauth-code`).delete({
        documentId: code.documentId,
      });
    }

    // Delete expired and revoked tokens
    const expiredTokens = await strapi.documents(`${PLUGIN_ID}.oauth-token`).findMany({
      filters: {
        $or: [
          { refreshExpiresAt: { $lt: now } },
          { revoked: true },
        ],
      },
    });

    for (const token of expiredTokens) {
      await strapi.documents(`${PLUGIN_ID}.oauth-token`).delete({
        documentId: token.documentId,
      });
    }

    return {
      deletedCodes: expiredCodes.length,
      deletedTokens: expiredTokens.length,
    };
  },
});

export default oauthService;
