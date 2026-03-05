import type { Core } from '@strapi/strapi';
import type { z } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  execute: (args: unknown, strapi: Core.Strapi, context?: { adminUserId?: number }) => Promise<unknown>;
  internal?: boolean;
  publicSafe?: boolean;
}

import { fetchTranscriptTool } from './fetch-transcript';
import { listTranscriptsTool } from './list-transcripts';
import { getTranscriptTool } from './get-transcript';
import { searchTranscriptTool } from './search-transcript';
import { findTranscriptsTool } from './find-transcripts';

export const tools: ToolDefinition[] = [
  fetchTranscriptTool,
  listTranscriptsTool,
  getTranscriptTool,
  searchTranscriptTool,
  findTranscriptsTool,
];

export {
  fetchTranscriptTool,
  listTranscriptsTool,
  getTranscriptTool,
  searchTranscriptTool,
  findTranscriptsTool,
};
