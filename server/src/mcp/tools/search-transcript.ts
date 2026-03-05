import type { Core } from '@strapi/strapi';
import { searchTranscriptTool } from '../../tools';

export { searchTranscriptTool };

// MCP tool definition (JSON Schema format for MCP protocol)
export const searchTranscriptToolMcp = {
  name: 'search_transcript',
  description: searchTranscriptTool.description,
  inputSchema: {
    type: 'object' as const,
    properties: {
      videoId: {
        type: 'string',
        description: 'YouTube video ID (e.g., "dQw4w9WgXcQ") or full YouTube URL',
      },
      query: {
        type: 'string',
        description: 'Search query - keywords or phrases to find in the transcript',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5, max: 20)',
      },
    },
    required: ['videoId', 'query'],
  },
};

/**
 * MCP handler -- delegates to canonical tool and wraps result in MCP envelope
 */
export async function handleSearchTranscript(strapi: Core.Strapi, args: unknown) {
  const result = await searchTranscriptTool.execute(args, strapi);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
