import type { Core } from '@strapi/strapi';
import { getTranscriptTool } from '../../tools';

export { getTranscriptTool };

// MCP tool definition (JSON Schema format for MCP protocol)
export const getTranscriptToolMcp = {
  name: 'get_transcript',
  description: getTranscriptTool.description,
  inputSchema: {
    type: 'object' as const,
    properties: {
      videoId: {
        type: 'string',
        description: 'YouTube video ID (e.g., "dQw4w9WgXcQ") or full YouTube URL',
      },
      includeFullTranscript: {
        type: 'boolean',
        description: 'Include the complete transcript text. Warning: may cause context overflow for long videos. Default: false',
      },
      includeTimecodes: {
        type: 'boolean',
        description: 'Include the transcript with timecodes array. Warning: significantly increases response size. Default: false',
      },
      startTime: {
        type: 'number',
        description: 'Start time in seconds for fetching a specific portion of the transcript',
      },
      endTime: {
        type: 'number',
        description: 'End time in seconds for fetching a specific portion of the transcript',
      },
      chunkIndex: {
        type: 'number',
        description: 'Chunk index (0-based) when paginating through transcript. Use with chunkSize to paginate through long videos.',
      },
      chunkSize: {
        type: 'number',
        description: 'Chunk size in seconds. Overrides config default. Use with chunkIndex for pagination.',
      },
    },
    required: ['videoId'],
  },
};

/**
 * MCP handler -- delegates to canonical tool and wraps result in MCP envelope
 */
export async function handleGetTranscript(strapi: Core.Strapi, args: unknown) {
  const result = await getTranscriptTool.execute(args, strapi);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
