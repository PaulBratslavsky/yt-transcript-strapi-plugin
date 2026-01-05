/**
 * OAuth Authentication Policy
 *
 * This policy handles dual authentication for MCP endpoints:
 * - OAuth 2.0 tokens (for ChatGPT and other OAuth clients)
 * - Direct Strapi API tokens (for Claude Desktop and scripts)
 *
 * On success: Sets ctx.state.strapiToken for use in controllers
 * On failure: Returns 401 with WWW-Authenticate header for OAuth discovery
 */

import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const { UnauthorizedError } = errors;
const PLUGIN_ID = 'plugin::yt-transcript-strapi-plugin';

/**
 * Extract bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Build the base URL from request headers (supports ngrok/proxies)
 */
function getBaseUrl(ctx: any, strapi: Core.Strapi): string {
  const forwardedProto = ctx.request.headers['x-forwarded-proto'] || ctx.protocol;
  const forwardedHost = ctx.request.headers['x-forwarded-host'] || ctx.request.headers['host'];
  const serverUrl = (strapi.config.get('server.url') as string) || 'http://localhost:1337';
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : serverUrl;
}

/**
 * Build WWW-Authenticate header value for OAuth discovery
 */
function buildWwwAuthenticateHeader(ctx: any, strapi: Core.Strapi): string {
  const baseUrl = getBaseUrl(ctx, strapi);
  const resourceMetadataUrl = `${baseUrl}/api/yt-transcript-strapi-plugin/.well-known/oauth-protected-resource`;
  return `Bearer resource_metadata="${resourceMetadataUrl}"`;
}

/**
 * Validate OAuth access token and return linked Strapi API token
 */
async function validateOAuthToken(
  token: string,
  strapi: Core.Strapi
): Promise<{ valid: boolean; strapiApiToken?: string; error?: string }> {
  try {
    // Find the token record
    const tokenRecord = await strapi.documents(`${PLUGIN_ID}.oauth-token`).findFirst({
      filters: { accessToken: token, revoked: false },
    });

    if (!tokenRecord) {
      return { valid: false };
    }

    // Check expiration
    if (new Date(tokenRecord.expiresAt as string) < new Date()) {
      return { valid: false, error: 'Token expired' };
    }

    // Get the linked OAuth client to find the Strapi API token
    const client = await strapi.documents(`${PLUGIN_ID}.oauth-client`).findFirst({
      filters: { clientId: tokenRecord.clientId as string },
    });

    if (!client) {
      return { valid: false, error: 'Client not found' };
    }

    return {
      valid: true,
      strapiApiToken: client.strapiApiToken as string,
    };
  } catch (error) {
    strapi.log.error('[oauth-auth] Error validating OAuth token', { error });
    return { valid: false, error: 'Token validation failed' };
  }
}

/**
 * OAuth Authentication Policy
 *
 * Usage in routes:
 * {
 *   method: 'POST',
 *   path: '/mcp',
 *   handler: 'mcp.handle',
 *   config: {
 *     auth: false,
 *     policies: ['plugin::yt-transcript-strapi-plugin.oauth-auth'],
 *   },
 * }
 */
const oauthAuthPolicy = (policyContext: any, config: any, { strapi }: { strapi: Core.Strapi }) => {
  return async (ctx: any, next: () => Promise<void>) => {
    const authHeader = ctx.request.headers.authorization;
    const token = extractBearerToken(authHeader);

    // No token provided - throw 401 with OAuth discovery header
    if (!token) {
      // Set the WWW-Authenticate header for OAuth discovery
      ctx.set('WWW-Authenticate', buildWwwAuthenticateHeader(ctx, strapi));

      // Throw UnauthorizedError to get proper 401 response
      throw new UnauthorizedError('No authorization token provided');
    }

    // Try OAuth token validation first
    const oauthResult = await validateOAuthToken(token, strapi);

    if (oauthResult.valid && oauthResult.strapiApiToken) {
      // OAuth token is valid - store the linked Strapi token
      ctx.state.strapiToken = oauthResult.strapiApiToken;
      ctx.state.authMethod = 'oauth';
      return next();
    }

    // If not a valid OAuth token, assume it's a direct Strapi API token
    // The controller can validate it further if needed
    ctx.state.strapiToken = token;
    ctx.state.authMethod = 'api-token';
    return next();
  };
};

export default oauthAuthPolicy;
