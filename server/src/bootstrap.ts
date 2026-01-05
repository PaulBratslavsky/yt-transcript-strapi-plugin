import type { Core } from '@strapi/strapi';
import { createMcpServer } from './mcp/server';
import oauthAuthMiddleware from './middlewares/oauth-auth';

const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  // Store the server factory function - we'll create server+transport per session
  const plugin = strapi.plugin('yt-transcript-strapi-plugin') as any;
  plugin.createMcpServer = () => createMcpServer(strapi);
  plugin.sessions = new Map(); // Track active sessions

  // Register OAuth authentication middleware
  const middleware = oauthAuthMiddleware({}, { strapi });
  strapi.server.use(middleware);

  strapi.log.info('[yt-transcript-mcp] MCP plugin initialized');
  strapi.log.info('[yt-transcript-mcp] MCP endpoint available at: /api/yt-transcript-strapi-plugin/mcp');
};

export default bootstrap;
