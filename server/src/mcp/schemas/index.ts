import { z } from 'zod';

// Schema for fetch_transcript tool
export const FetchTranscriptSchema = z.object({
  videoId: z.string().min(1, 'Video ID or URL is required'),
});

// Schema for list_transcripts tool
export const ListTranscriptsSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(25),
  sort: z.string().optional().default('createdAt:desc'),
});

// Schema for get_transcript tool
export const GetTranscriptSchema = z.object({
  videoId: z.string().min(1, 'Video ID is required'),
});

// Schema for find_transcripts tool
export const FindTranscriptsSchema = z.object({
  query: z.string().optional(),
  videoId: z.string().optional(),
  title: z.string().optional(),
  includeFullContent: z.boolean().optional().default(false),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(25),
  sort: z.string().optional().default('createdAt:desc'),
});

// Type exports
export type FetchTranscriptInput = z.infer<typeof FetchTranscriptSchema>;
export type ListTranscriptsInput = z.infer<typeof ListTranscriptsSchema>;
export type GetTranscriptInput = z.infer<typeof GetTranscriptSchema>;
export type FindTranscriptsInput = z.infer<typeof FindTranscriptsSchema>;

// All schemas for easy lookup
export const ToolSchemas = {
  fetch_transcript: FetchTranscriptSchema,
  list_transcripts: ListTranscriptsSchema,
  get_transcript: GetTranscriptSchema,
  find_transcripts: FindTranscriptsSchema,
} as const;

type ToolName = keyof typeof ToolSchemas;

// Validation helper function
export function validateToolInput<T extends ToolName>(
  toolName: T,
  input: unknown
): z.infer<(typeof ToolSchemas)[T]> {
  const schema = ToolSchemas[toolName];
  const result = schema.safeParse(input);

  if (!result.success) {
    const errorMessages = result.error.issues.map((err) => {
      const path = err.path.length > 0 ? `${err.path.join('.')}: ` : '';
      return `${path}${err.message}`;
    });
    throw new Error(`Validation failed for ${toolName}:\n${errorMessages.join('\n')}`);
  }

  return result.data as z.infer<(typeof ToolSchemas)[T]>;
}
