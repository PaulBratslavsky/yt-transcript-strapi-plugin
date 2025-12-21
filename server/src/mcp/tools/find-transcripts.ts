import type { Core } from '@strapi/strapi';
import { validateToolInput } from '../schemas';

export const findTranscriptsTool = {
  name: 'find_transcripts',
  description:
    'Search and filter transcripts based on query criteria. Returns multiple matching transcripts. Supports filtering by title, videoId, and full-text search in transcript content.',
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

export async function handleFindTranscripts(strapi: Core.Strapi, args: unknown) {
  const validatedArgs = validateToolInput('find_transcripts', args);
  const { query, videoId, title, page, pageSize, sort } = validatedArgs;

  const start = (page - 1) * pageSize;

  // Build filters based on search criteria
  const filters: Record<string, any> = {};

  if (videoId) {
    filters.videoId = { $containsi: videoId };
  }

  if (title) {
    filters.title = { $containsi: title };
  }

  // If query is provided, search in multiple fields using $or
  if (query) {
    filters.$or = [
      { title: { $containsi: query } },
      { videoId: { $containsi: query } },
      { fullTranscript: { $containsi: query } },
      { readableTranscript: { $containsi: query } },
    ];
  }

  // Query transcripts from database
  const transcripts = await strapi.documents('plugin::yt-transcript-strapi-plugin.transcript').findMany({
    filters,
    sort,
    limit: pageSize,
    start,
  });

  // Get total count for matching filters
  const allMatching = await strapi.documents('plugin::yt-transcript-strapi-plugin.transcript').findMany({
    filters,
  });
  const total = allMatching.length;

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
            filters: {
              query: query || null,
              videoId: videoId || null,
              title: title || null,
            },
          },
          null,
          2
        ),
      },
    ],
  };
}
