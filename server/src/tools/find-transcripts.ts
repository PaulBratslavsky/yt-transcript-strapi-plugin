import type { Core } from '@strapi/strapi';
import { FindTranscriptsSchema } from '../mcp/schemas';
import type { ToolDefinition } from './index';

const TRANSCRIPT_PREVIEW_LENGTH = 244;

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
  }));
}

async function execute(args: unknown, strapi: Core.Strapi): Promise<unknown> {
  const validatedArgs = FindTranscriptsSchema.parse(args);
  const { query, videoId, title, includeFullContent, page, pageSize, sort } = validatedArgs;

  const start = (page - 1) * pageSize;

  const filters: Record<string, any> = {};

  if (videoId) {
    filters.videoId = { $containsi: videoId };
  }

  if (title) {
    filters.title = { $containsi: title };
  }

  if (query) {
    filters.$or = [
      { title: { $containsi: query } },
      { videoId: { $containsi: query } },
      { fullTranscript: { $containsi: query } },
    ];
  }

  const transcripts = await strapi.documents('plugin::yt-transcript-strapi-plugin.transcript').findMany({
    filters,
    sort,
    limit: pageSize,
    start,
  });

  const allMatching = await strapi.documents('plugin::yt-transcript-strapi-plugin.transcript').findMany({
    filters,
  });
  const total = allMatching.length;

  const processedTranscripts = includeFullContent ? transcripts : truncateTranscripts(transcripts);

  return {
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
    ...(!includeFullContent && { note: 'Transcript content truncated to 244 chars. Use getTranscript for full content or set includeFullContent=true.' }),
  };
}

export const findTranscriptsTool: ToolDefinition = {
  name: 'findTranscripts',
  description:
    'Search and filter transcripts based on query criteria. Returns multiple matching transcripts with truncated previews (244 chars). Use getTranscript for full content. Supports filtering by title, videoId, and full-text search.',
  schema: FindTranscriptsSchema,
  execute,
  publicSafe: true,
};
