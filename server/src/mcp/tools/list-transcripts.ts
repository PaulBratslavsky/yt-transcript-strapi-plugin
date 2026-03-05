import type { Core } from '@strapi/strapi';
import { listTranscriptsTool } from '../../tools';

export { listTranscriptsTool };

// MCP tool definition (JSON Schema format for MCP protocol)
export const listTranscriptsToolMcp = {
  name: 'list_transcripts',
  description: listTranscriptsTool.description,
  inputSchema: {
    type: 'object' as const,
    properties: {
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
export async function handleListTranscripts(strapi: Core.Strapi, args: unknown) {
  const result = await listTranscriptsTool.execute(args, strapi);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
