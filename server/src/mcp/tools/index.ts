import type { Core } from '@strapi/strapi';

// Import MCP tool definitions and handlers
import { fetchTranscriptToolMcp, handleFetchTranscript } from './fetch-transcript';
import { listTranscriptsToolMcp, handleListTranscripts } from './list-transcripts';
import { getTranscriptToolMcp, handleGetTranscript } from './get-transcript';
import { searchTranscriptToolMcp, handleSearchTranscript } from './search-transcript';
import { findTranscriptsToolMcp, handleFindTranscripts } from './find-transcripts';

// Export all MCP tool definitions (JSON Schema format for MCP protocol)
export const tools = [
  fetchTranscriptToolMcp,
  listTranscriptsToolMcp,
  getTranscriptToolMcp,
  searchTranscriptToolMcp,
  findTranscriptsToolMcp,
];

// Tool handler registry
const toolHandlers: Record<string, (strapi: Core.Strapi, args: unknown) => Promise<any>> = {
  fetch_transcript: handleFetchTranscript,
  list_transcripts: handleListTranscripts,
  get_transcript: handleGetTranscript,
  search_transcript: handleSearchTranscript,
  find_transcripts: handleFindTranscripts,
};

/**
 * Handle a tool call by delegating to the appropriate handler
 */
export async function handleToolCall(
  strapi: Core.Strapi,
  request: { params: { name: string; arguments?: Record<string, unknown> } }
) {
  const { name, arguments: args } = request.params;

  const handler = toolHandlers[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const startTime = Date.now();
  try {
    const result = await handler(strapi, args || {});
    const duration = Date.now() - startTime;

    strapi.log.debug(`[yt-transcript-mcp] Tool ${name} executed successfully in ${duration}ms`);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    strapi.log.error(`[yt-transcript-mcp] Tool ${name} failed after ${duration}ms`, {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: true,
              message: error instanceof Error ? error.message : String(error),
              tool: name,
            },
            null,
            2
          ),
        },
      ],
    };
  }
}
