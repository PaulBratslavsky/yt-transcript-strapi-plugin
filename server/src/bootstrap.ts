import type { Core } from '@strapi/strapi';
import { createMcpServer } from './mcp/server';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

const PLUGIN_ID = 'yt-transcript-strapi-plugin';
const OAUTH_PLUGIN_ID = 'strapi-oauth-mcp-manager';

/**
 * Test proxy connectivity by making a request to check IP
 */
async function testProxyConnection(proxyUrl: string): Promise<{ success: boolean; ip?: string; error?: string }> {
  try {
    const proxyAgent = new ProxyAgent(proxyUrl);

    // Use httpbin to check our outbound IP
    const response = await undiciFetch('https://httpbin.org/ip', {
      dispatcher: proxyAgent,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    } as any);

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json() as { origin?: string };
    return { success: true, ip: data.origin };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Fallback auth middleware for when OAuth manager plugin is not installed.
 * Requires Bearer token (Strapi API token) for MCP endpoints.
 * This allows standalone use with Claude Desktop without OAuth.
 */
function createFallbackAuthMiddleware(strapi: Core.Strapi) {
  const mcpPath = `/api/${PLUGIN_ID}/mcp`;

  return async (ctx: any, next: () => Promise<void>) => {
    // Only apply to this plugin's MCP endpoint
    if (!ctx.path.startsWith(mcpPath)) {
      return next();
    }

    const authHeader = ctx.request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      ctx.status = 401;
      ctx.body = {
        error: 'Unauthorized',
        message: 'Bearer token required. Provide a Strapi API token.',
      };
      return;
    }

    // Extract token and set it for the controller
    const token = authHeader.slice(7);
    ctx.state.strapiToken = token;
    ctx.state.authMethod = 'api-token';

    return next();
  };
}

interface PluginConfig {
  proxyUrl?: string;
  chunkSizeSeconds?: number;
  previewLength?: number;
  maxFullTranscriptLength?: number;
  searchSegmentSeconds?: number;
}

const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  // Store the server factory function - we'll create server+transport per session
  const plugin = strapi.plugin(PLUGIN_ID) as any;
  plugin.createMcpServer = () => createMcpServer(strapi);
  plugin.sessions = new Map(); // Track active sessions

  // Log proxy configuration status and test connectivity
  const pluginConfig = strapi.config.get('plugin::yt-transcript-strapi-plugin') as PluginConfig | undefined;
  if (pluginConfig?.proxyUrl) {
    // Mask the proxy URL for security (hide credentials)
    const maskedUrl = pluginConfig.proxyUrl.replace(/:([^@:]+)@/, ':****@');
    strapi.log.info(`[${PLUGIN_ID}] Proxy configured: ${maskedUrl}`);

    // Test proxy connectivity (non-blocking)
    testProxyConnection(pluginConfig.proxyUrl).then((result) => {
      if (result.success) {
        strapi.log.info(`[${PLUGIN_ID}] ✓ Proxy connection successful - Outbound IP: ${result.ip}`);
      } else {
        strapi.log.error(`[${PLUGIN_ID}] ✗ Proxy connection FAILED: ${result.error}`);
        strapi.log.error(`[${PLUGIN_ID}] YouTube requests will likely fail. Check your proxy credentials and URL.`);
      }
    });
  } else {
    strapi.log.warn(`[${PLUGIN_ID}] No proxy configured - YouTube may block requests. Set PROXY_URL in .env`);
  }

  // Check if OAuth manager is installed
  // If not, use fallback auth middleware (API token only)
  const oauthPlugin = strapi.plugin(OAUTH_PLUGIN_ID);

  if (oauthPlugin) {
    // OAuth manager handles auth via convention-based middleware
    // Any /api/*/mcp route is automatically protected
    strapi.log.info(`[${PLUGIN_ID}] OAuth manager detected - OAuth + API token auth enabled`);
  } else {
    // No OAuth manager - use fallback auth
    const fallbackMiddleware = createFallbackAuthMiddleware(strapi);
    strapi.server.use(fallbackMiddleware);
    strapi.log.info(`[${PLUGIN_ID}] Using API token authentication (OAuth manager not installed)`);
  }

  strapi.log.info(`[${PLUGIN_ID}] MCP endpoint available at: /api/${PLUGIN_ID}/mcp`);
};

export default bootstrap;
