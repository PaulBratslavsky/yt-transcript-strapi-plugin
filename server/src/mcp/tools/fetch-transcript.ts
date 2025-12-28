import type { Core } from '@strapi/strapi';
import { validateToolInput } from '../schemas';
import { extractYouTubeID } from '../../utils/extract-youtube-id';

export const fetchTranscriptTool = {
  name: 'fetch_transcript',
  description:
    'Fetch a transcript from YouTube for a given video ID or URL. The transcript is saved to the database for future retrieval.',
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

export async function handleFetchTranscript(strapi: Core.Strapi, args: unknown) {
  const validatedArgs = validateToolInput('fetch_transcript', args);
  const { videoId: videoIdOrUrl } = validatedArgs;

  // Extract the video ID from URL or use as-is
  const videoId = extractYouTubeID(videoIdOrUrl);
  if (!videoId) {
    throw new Error(`Invalid YouTube video ID or URL: "${videoIdOrUrl}". Please provide a valid 11-character video ID or YouTube URL.`);
  }

  const service = strapi.plugin('yt-transcript-strapi-plugin').service('service');

  // Check if transcript already exists in database
  const existingTranscript = await service.findTranscript(videoId);
  if (existingTranscript) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              message: 'Transcript already exists in database',
              data: existingTranscript,
              cached: true,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Fetch transcript from YouTube
  const transcriptData = await service.getTranscript(videoId);

  if (!transcriptData || !transcriptData.fullTranscript) {
    throw new Error('No transcript data returned from YouTube');
  }

  // Prepare the payload
  const payload: Record<string, any> = {
    videoId,
    title: transcriptData.title || `YouTube Video ${videoId}`,
    fullTranscript: transcriptData.fullTranscript,
    transcriptWithTimeCodes: transcriptData.transcriptWithTimeCodes,
  };

  // Save to database
  const savedTranscript = await service.saveTranscript(payload);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            message: 'Transcript fetched and saved successfully',
            data: savedTranscript,
            cached: false,
          },
          null,
          2
        ),
      },
    ],
  };
}
