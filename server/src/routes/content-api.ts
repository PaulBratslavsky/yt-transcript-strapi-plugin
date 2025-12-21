export default [
  // MCP endpoints - must be before wildcard routes
  {
    method: 'POST',
    path: '/mcp',
    handler: 'mcp.handle',
    config: {
      policies: [],
      auth: false,
    },
  },
  {
    method: 'GET',
    path: '/mcp',
    handler: 'mcp.handle',
    config: {
      policies: [],
      auth: false,
    },
  },
  {
    method: 'DELETE',
    path: '/mcp',
    handler: 'mcp.handle',
    config: {
      policies: [],
      auth: false,
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