import type { OAuthValidationResult } from './services/oauth';

/**
 * Minimal interface for MCP server - avoids importing deprecated Server type
 */
export interface McpServerInstance {
  connect(transport: unknown): Promise<void>;
  close(): Promise<void>;
}

/**
 * Minimal interface for MCP transport
 */
export interface McpTransportInstance {
  handleRequest(req: unknown, res: unknown, body: unknown): Promise<void>;
}

export interface McpSession {
  server: McpServerInstance;
  transport: McpTransportInstance;
  createdAt: number;
  strapiToken?: string;
}

export interface OAuthService {
  validateAccessToken(accessToken: string): Promise<OAuthValidationResult>;
  cleanupExpiredTokens(): Promise<{ deletedCodes: number; deletedTokens: number }>;
}

export interface YtTranscriptPlugin {
  createMcpServer: () => McpServerInstance;
  sessions: Map<string, McpSession>;
  service(name: 'oauth'): OAuthService;
  service(name: string): unknown;
}
