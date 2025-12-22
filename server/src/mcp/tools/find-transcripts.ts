import type { Core } from '@strapi/strapi';
import { validateToolInput } from '../schemas';

// Maximum characters to show for transcript preview
const TRANSCRIPT_PREVIEW_LENGTH = 244;

export const findTranscriptsTool = {
  name: 'find_transcripts',
  description:
    'Search and filter transcripts based on query criteria. Returns multiple matching transcripts with truncated previews (244 chars). Use get_transcript for full content. Supports filtering by title, videoId, and full-text search.',
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

/**
 * Truncates a string to a maximum length with ellipsis
 */
function truncateText(text: string | null | undefined, maxLength: number): string | null {
  if (!text) return null;
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Truncates transcript fields in an array of transcripts
 */
function truncateTranscripts(transcripts: any[]): any[] {
  return transcripts.map((transcript) => ({
    ...transcript,
    fullTranscript: truncateText(transcript.fullTranscript, TRANSCRIPT_PREVIEW_LENGTH),
    readableTranscript: truncateText(transcript.readableTranscript, TRANSCRIPT_PREVIEW_LENGTH),
  }));
}

export async function handleFindTranscripts(strapi: Core.Strapi, args: unknown) {
  const validatedArgs = validateToolInput('find_transcripts', args);
  const { query, videoId, title, includeFullContent, page, pageSize, sort } = validatedArgs;

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

  // Truncate transcript content unless full content is requested
  const processedTranscripts = includeFullContent ? transcripts : truncateTranscripts(transcripts);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            data: processedTranscripts,
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
            ...(!includeFullContent && { note: 'Transcript content truncated to 244 chars. Use get_transcript for full content or set includeFullContent=true.' }),
          },
          null,
          2
        ),
      },
    ],
  };
}
