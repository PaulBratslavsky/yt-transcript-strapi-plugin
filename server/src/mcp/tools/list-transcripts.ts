import type { Core } from '@strapi/strapi';
import { validateToolInput } from '../schemas';

export const listTranscriptsTool = {
  name: 'list_transcripts',
  description:
    'List all saved YouTube transcripts from the database. Supports pagination and sorting.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      page: {
        type: 'number',
        description: 'Page number (starts at 1)',
        default: 1,
      },
      pageSize: {
        type: 'number',
        description: 'Number of items per page (max 100)',
        default: 25,
      },
      sort: {
        type: 'string',
        description: 'Sort order (e.g., "createdAt:desc", "title:asc")',
        default: 'createdAt:desc',
      },
    },
    required: [],
  },
};

export async function handleListTranscripts(strapi: Core.Strapi, args: unknown) {
  const validatedArgs = validateToolInput('list_transcripts', args);
  const { page, pageSize, sort } = validatedArgs;

  const start = (page - 1) * pageSize;

  // Query transcripts from database
  const transcripts = await strapi.documents('plugin::yt-transcript-strapi-plugin.transcript').findMany({
    sort,
    limit: pageSize,
    start,
    fields: ['id', 'documentId', 'title', 'videoId', 'createdAt', 'updatedAt'],
  });

  // Get total count
  const allTranscripts = await strapi.documents('plugin::yt-transcript-strapi-plugin.transcript').findMany({});
  const total = allTranscripts.length;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            data: transcripts,
            pagination: {
              page,
              pageSize,
              total,
              pageCount: Math.ceil(total / pageSize),
            },
          },
          null,
          2
        ),
      },
    ],
  };
}
