export default [
  // OAuth 2.0 Authorization Server Metadata (multiple paths for compatibility)
  {
    method: 'GET',
    path: '/.well-known/oauth-authorization-server',
    handler: 'oauth.discovery',
    config: {
      auth: false,
      policies: [],
    },
  },
  {
    method: 'GET',
    path: '/mcp/.well-known/oauth-authorization-server',
    handler: 'oauth.discovery',
    config: {
      auth: false,
      policies: [],
    },
  },
  {
    method: 'GET',
    path: '/.well-known/oauth-protected-resource',
    handler: 'oauth.protectedResource',
    config: {
      auth: false,
      policies: [],
    },
  },
  // OAuth 2.0 Authorization Endpoint
  {
    method: 'GET',
    path: '/oauth/authorize',
    handler: 'oauth.authorize',
    config: {
      auth: false,
      policies: [],
    },
  },
  // OAuth 2.0 Token Endpoint
  {
    method: 'POST',
    path: '/oauth/token',
    handler: 'oauth.token',
    config: {
      auth: false,
      policies: [],
    },
  },
  // OAuth Client Management
  {
    method: 'POST',
    path: '/oauth-clients',
    handler: 'oauth-client.create',
    config: {
      auth: false,
      policies: [],
    },
  },
  {
    method: 'GET',
    path: '/oauth-clients',
    handler: 'oauth-client.find',
    config: {
      auth: false,
      policies: [],
    },
  },
  {
    method: 'PUT',
    path: '/oauth-clients/:id',
    handler: 'oauth-client.update',
    config: {
      auth: false,
      policies: [],
    },
  },
  {
    method: 'DELETE',
    path: '/oauth-clients/:id',
    handler: 'oauth-client.delete',
    config: {
      auth: false,
      policies: [],
    },
  },
];
