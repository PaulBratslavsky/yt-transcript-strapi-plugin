import type { Core } from '@strapi/strapi';
import { ListTranscriptsSchema } from '../mcp/schemas';
import type { ToolDefinition } from './index';

async function execute(args: unknown, strapi: Core.Strapi): Promise<unknown> {
  const validatedArgs = ListTranscriptsSchema.parse(args);
  const { page, pageSize, sort } = validatedArgs;

  const start = (page - 1) * pageSize;

  const transcripts = await strapi.documents('plugin::yt-transcript-strapi-plugin.transcript').findMany({
    sort,
    limit: pageSize,
    start,
    fields: ['id', 'documentId', 'title', 'videoId', 'createdAt', 'updatedAt'],
  });

  const allTranscripts = await strapi.documents('plugin::yt-transcript-strapi-plugin.transcript').findMany({});
  const total = allTranscripts.length;

  return {
    data: transcripts,
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.ceil(total / pageSize),
    },
  };
}

export const listTranscriptsTool: ToolDefinition = {
  name: 'listTranscripts',
  description:
    'List all saved YouTube transcripts from the database. Supports pagination and sorting.',
  schema: ListTranscriptsSchema,
  execute,
  publicSafe: true,
};
