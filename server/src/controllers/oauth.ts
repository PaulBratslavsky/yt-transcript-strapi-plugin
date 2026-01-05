import type { Core } from '@strapi/strapi';
import { randomBytes } from 'node:crypto';

const PLUGIN_ID = 'plugin::yt-transcript-strapi-plugin';

const oauthController = ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * OAuth 2.0 Authorization Server Metadata (RFC 8414)
   * GET /.well-known/oauth-authorization-server
   */
  async discovery(ctx: any) {
    // Use the request's origin/host for external access (ngrok, etc.)
    const forwardedProto = ctx.request.headers['x-forwarded-proto'] || ctx.protocol;
    const forwardedHost = ctx.request.headers['x-forwarded-host'] || ctx.request.headers['host'];
    const baseUrl = forwardedHost ? `${forwardedProto}://${forwardedHost}` : strapi.config.get('server.url');
    const pluginPath = '/api/yt-transcript-strapi-plugin';
    // Issuer must match where discovery is served for MCP clients to find it
    const issuer = `${baseUrl}${pluginPath}`;

    ctx.body = {
      issuer,
      authorization_endpoint: `${baseUrl}${pluginPath}/oauth/authorize`,
      token_endpoint: `${baseUrl}${pluginPath}/oauth/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['S256'],
    };
  },

  /**
   * OAuth 2.0 Protected Resource Metadata (RFC 9728)
   * GET /.well-known/oauth-protected-resource
   */
  async protectedResource(ctx: any) {
    const forwardedProto = ctx.request.headers['x-forwarded-proto'] || ctx.protocol;
    const forwardedHost = ctx.request.headers['x-forwarded-host'] || ctx.request.headers['host'];
    const baseUrl = forwardedHost ? `${forwardedProto}://${forwardedHost}` : strapi.config.get('server.url');
    const pluginPath = '/api/yt-transcript-strapi-plugin';
    // Authorization server issuer must include plugin path so clients find discovery at the right URL
    const authServer = `${baseUrl}${pluginPath}`;

    ctx.body = {
      resource: `${baseUrl}${pluginPath}/mcp`,
      authorization_servers: [authServer],
      bearer_methods_supported: ['header'],
    };
  },

  /**
   * OAuth 2.0 Authorization Endpoint
   * GET /oauth/authorize
   */
  async authorize(ctx: any) {
    const { client_id, redirect_uri, response_type, state, scope } = ctx.query;

    // Validate required parameters
    if (!client_id) {
      ctx.status = 400;
      ctx.body = { error: 'invalid_request', error_description: 'client_id is required' };
      return;
    }

    if (!redirect_uri) {
      ctx.status = 400;
      ctx.body = { error: 'invalid_request', error_description: 'redirect_uri is required' };
      return;
    }

    if (response_type !== 'code') {
      ctx.status = 400;
      ctx.body = { error: 'unsupported_response_type', error_description: 'Only code response type is supported' };
      return;
    }

    // Find the OAuth client
    const client = await strapi.documents(`${PLUGIN_ID}.oauth-client`).findFirst({
      filters: { clientId: client_id, active: true },
    });

    if (!client) {
      ctx.status = 400;
      ctx.body = { error: 'invalid_client', error_description: 'Unknown client_id' };
      return;
    }

    // Validate redirect_uri
    const allowedRedirects = client.redirectUris as string[];
    if (!allowedRedirects.includes(redirect_uri)) {
      ctx.status = 400;
      ctx.body = { error: 'invalid_request', error_description: 'Invalid redirect_uri' };
      return;
    }

    // Generate authorization code
    const code = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store the authorization code
    await strapi.documents(`${PLUGIN_ID}.oauth-code`).create({
      data: {
        code,
        clientId: client_id,
        redirectUri: redirect_uri,
        expiresAt: expiresAt.toISOString(),
        used: false,
      },
    });

    // Redirect back with the authorization code
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (state) {
      redirectUrl.searchParams.set('state', state);
    }

    ctx.redirect(redirectUrl.toString());
  },

  /**
   * OAuth 2.0 Token Endpoint
   * POST /oauth/token
   */
  async token(ctx: any) {
    const { grant_type, code, redirect_uri, client_id, client_secret, refresh_token } = ctx.request.body;

    // Also check for Basic auth header
    let authClientId = client_id;
    let authClientSecret = client_secret;

    const authHeader = ctx.request.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
      const [id, secret] = credentials.split(':');
      authClientId = authClientId || id;
      authClientSecret = authClientSecret || secret;
    }

    if (!authClientId || !authClientSecret) {
      ctx.status = 401;
      ctx.body = { error: 'invalid_client', error_description: 'Client authentication required' };
      return;
    }

    // Verify client credentials
    const client = await strapi.documents(`${PLUGIN_ID}.oauth-client`).findFirst({
      filters: { clientId: authClientId, active: true },
    });

    if (!client || client.clientSecret !== authClientSecret) {
      ctx.status = 401;
      ctx.body = { error: 'invalid_client', error_description: 'Invalid client credentials' };
      return;
    }

    if (grant_type === 'authorization_code') {
      return await handleAuthorizationCodeGrant(ctx, strapi, client, code, redirect_uri);
    } else if (grant_type === 'refresh_token') {
      return await handleRefreshTokenGrant(ctx, strapi, client, refresh_token);
    } else {
      ctx.status = 400;
      ctx.body = { error: 'unsupported_grant_type', error_description: 'Unsupported grant type' };
    }
  },
});

async function handleAuthorizationCodeGrant(
  ctx: any,
  strapi: Core.Strapi,
  client: any,
  code: string,
  redirect_uri: string
) {
  if (!code) {
    ctx.status = 400;
    ctx.body = { error: 'invalid_request', error_description: 'code is required' };
    return;
  }

  // Find and validate the authorization code
  const authCode = await strapi.documents(`${PLUGIN_ID}.oauth-code`).findFirst({
    filters: { code, clientId: client.clientId, used: false },
  });

  if (!authCode) {
    ctx.status = 400;
    ctx.body = { error: 'invalid_grant', error_description: 'Invalid authorization code' };
    return;
  }

  // Check expiration
  if (new Date(authCode.expiresAt) < new Date()) {
    ctx.status = 400;
    ctx.body = { error: 'invalid_grant', error_description: 'Authorization code expired' };
    return;
  }

  // Check redirect_uri matches
  if (authCode.redirectUri !== redirect_uri) {
    ctx.status = 400;
    ctx.body = { error: 'invalid_grant', error_description: 'redirect_uri mismatch' };
    return;
  }

  // Mark code as used
  await strapi.documents(`${PLUGIN_ID}.oauth-code`).update({
    documentId: authCode.documentId,
    data: { used: true } as any,
  });

  // Generate tokens
  const accessToken = randomBytes(32).toString('hex');
  const refreshToken = randomBytes(32).toString('hex');
  const expiresIn = 3600; // 1 hour
  const refreshExpiresIn = 30 * 24 * 3600; // 30 days

  await strapi.documents(`${PLUGIN_ID}.oauth-token`).create({
    data: {
      accessToken,
      refreshToken,
      clientId: client.clientId,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      refreshExpiresAt: new Date(Date.now() + refreshExpiresIn * 1000).toISOString(),
      revoked: false,
    },
  });

  ctx.body = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    refresh_token: refreshToken,
  };
}

async function handleRefreshTokenGrant(
  ctx: any,
  strapi: Core.Strapi,
  client: any,
  refreshToken: string
) {
  if (!refreshToken) {
    ctx.status = 400;
    ctx.body = { error: 'invalid_request', error_description: 'refresh_token is required' };
    return;
  }

  // Find the token
  const token = await strapi.documents(`${PLUGIN_ID}.oauth-token`).findFirst({
    filters: { refreshToken, clientId: client.clientId, revoked: false },
  });

  if (!token) {
    ctx.status = 400;
    ctx.body = { error: 'invalid_grant', error_description: 'Invalid refresh token' };
    return;
  }

  // Check refresh token expiration
  if (new Date(token.refreshExpiresAt) < new Date()) {
    ctx.status = 400;
    ctx.body = { error: 'invalid_grant', error_description: 'Refresh token expired' };
    return;
  }

  // Revoke old token
  await strapi.documents(`${PLUGIN_ID}.oauth-token`).update({
    documentId: token.documentId,
    data: { revoked: true } as any,
  });

  // Generate new tokens
  const newAccessToken = randomBytes(32).toString('hex');
  const newRefreshToken = randomBytes(32).toString('hex');
  const expiresIn = 3600;
  const refreshExpiresIn = 30 * 24 * 3600;

  await strapi.documents(`${PLUGIN_ID}.oauth-token`).create({
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      clientId: client.clientId,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      refreshExpiresAt: new Date(Date.now() + refreshExpiresIn * 1000).toISOString(),
      revoked: false,
    },
  });

  ctx.body = {
    access_token: newAccessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    refresh_token: newRefreshToken,
  };
}

export default oauthController;
