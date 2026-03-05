import type { Core } from '@strapi/strapi';
import { fetchTranscriptTool } from '../../tools';

export { fetchTranscriptTool };

// MCP tool definition (JSON Schema format for MCP protocol)
export const fetchTranscriptToolMcp = {
  name: 'fetch_transcript',
  description: fetchTranscriptTool.description,
  inputSchema: {
    type: 'object' as const,
    properties: {
      videoId: {
        type: 'string',
        description: 'YouTube video ID (e.g., "dQw4w9WgXcQ") or full YouTube URL',
      },
    },
    required: ['videoId'],
  },
};

/**
 * MCP handler -- delegates to canonical tool and wraps result in MCP envelope
 */
export async function handleFetchTranscript(strapi: Core.Strapi, args: unknown) {
  const result = await fetchTranscriptTool.execute(args, strapi);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
