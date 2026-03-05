import type { Core } from '@strapi/strapi';
import { findTranscriptsTool } from '../../tools';

export { findTranscriptsTool };

// MCP tool definition (JSON Schema format for MCP protocol)
export const findTranscriptsToolMcp = {
  name: 'find_transcripts',
  description: findTranscriptsTool.description,
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query to match against title or transcript content',
      },
      videoId: {
        type: 'string',
        description: 'Filter by specific video ID (partial match supported)',
      },
      title: {
        type: 'string',
        description: 'Filter by title (partial match, case-insensitive)',
      },
      includeFullContent: {
        type: 'boolean',
        description: 'Set to true to include full transcript content. Default: false. Warning: may cause context overflow with multiple results.',
      },
      page: {
        type: 'number',
        description: 'Page number (starts at 1)',
      },
      pageSize: {
        type: 'number',
        description: 'Number of items per page (max 100)',
      },
      sort: {
        type: 'string',
        description: 'Sort order (e.g., "createdAt:desc", "title:asc")',
      },
    },
    required: [],
  },
};

/**
 * MCP handler -- delegates to canonical tool and wraps result in MCP envelope
 */
export async function handleFindTranscripts(strapi: Core.Strapi, args: unknown) {
  const result = await findTranscriptsTool.execute(args, strapi);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
