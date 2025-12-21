import type { Core } from '@strapi/strapi';
import { validateToolInput } from '../schemas';
import { extractYouTubeID } from '../../utils/extract-youtube-id';

export const getTranscriptTool = {
  name: 'get_transcript',
  description:
    'Get a specific saved transcript by YouTube video ID. Returns the full transcript data including any readable version if available.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      videoId: {
        type: 'string',
        description: 'YouTube video ID (e.g., "dQw4w9WgXcQ") or full YouTube URL',
      },
    },
    required: ['videoId'],
  },
};

export async function handleGetTranscript(strapi: Core.Strapi, args: unknown) {
  const validatedArgs = validateToolInput('get_transcript', args);
  const { videoId: videoIdOrUrl } = validatedArgs;

  // Extract the video ID from URL or use as-is
  const videoId = extractYouTubeID(videoIdOrUrl);
  if (!videoId) {
    throw new Error(`Invalid YouTube video ID or URL: "${videoIdOrUrl}". Please provide a valid 11-character video ID or YouTube URL.`);
  }

  const service = strapi.plugin('yt-transcript-strapi-plugin').service('service');

  // Find transcript in database
  const transcript = await service.findTranscript(videoId);

  if (!transcript) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: true,
              message: `No transcript found for video ID: ${videoId}. Use fetch_transcript to fetch it from YouTube first.`,
              videoId,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            data: transcript,
          },
          null,
          2
        ),
      },
    ],
  };
}
