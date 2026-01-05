export default [
  // MCP endpoints - auth: false bypasses Strapi auth, oauth-auth middleware handles authentication
  {
    method: 'POST',
    path: '/mcp',
    handler: 'mcp.handle',
    config: {
      auth: false,
      policies: [],
    },
  },
  {
    method: 'GET',
    path: '/mcp',
    handler: 'mcp.handle',
    config: {
      auth: false,
      policies: [],
    },
  },
  {
    method: 'DELETE',
    path: '/mcp',
    handler: 'mcp.handle',
    config: {
      auth: false,
      policies: [],
    },
  },
  // Other routes
  {
    method: 'GET',
    path: '/yt-transcript/:videoId',
    handler: 'controller.getTranscript',
    config: {
      policies: [],
    },
  },
];