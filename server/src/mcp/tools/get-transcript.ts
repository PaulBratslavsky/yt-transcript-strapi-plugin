import type { Core } from '@strapi/strapi';
import { validateToolInput } from '../schemas';
import { extractYouTubeID } from '../../utils/extract-youtube-id';

interface PluginConfig {
  chunkSizeSeconds?: number;
  previewLength?: number;
  maxFullTranscriptLength?: number;
}

interface TimecodeEntry {
  start: number;
  end: number;
  text: string;
  duration: number;
}

export const getTranscriptTool = {
  name: 'get_transcript',
  description:
    'Get a saved transcript by YouTube video ID. Returns metadata and preview by default. Use parameters to get full content or specific time ranges to avoid context overflow.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      videoId: {
        type: 'string',
        description: 'YouTube video ID (e.g., "dQw4w9WgXcQ") or full YouTube URL',
      },
      includeFullTranscript: {
        type: 'boolean',
        description: 'Include the complete transcript text. Warning: may cause context overflow for long videos. Default: false',
        default: false,
      },
      includeTimecodes: {
        type: 'boolean',
        description: 'Include the transcript with timecodes array. Warning: significantly increases response size. Default: false',
        default: false,
      },
      startTime: {
        type: 'number',
        description: 'Start time in seconds for fetching a specific portion of the transcript',
      },
      endTime: {
        type: 'number',
        description: 'End time in seconds for fetching a specific portion of the transcript',
      },
      chunkIndex: {
        type: 'number',
        description: 'Chunk index (0-based) when paginating through transcript. Use with chunkSize to paginate through long videos.',
      },
      chunkSize: {
        type: 'number',
        description: 'Chunk size in seconds. Overrides config default. Use with chunkIndex for pagination.',
      },
    },
    required: ['videoId'],
  },
};

/**
 * Get transcript text for a specific time range from timecoded entries
 */
function getTranscriptForTimeRange(
  timecodes: TimecodeEntry[],
  startTimeMs: number,
  endTimeMs: number
): { text: string; entries: TimecodeEntry[] } {
  const entries = timecodes.filter(
    (entry) => entry.start >= startTimeMs && entry.start < endTimeMs
  );
  const text = entries.map((e) => e.text).join(' ');
  return { text, entries };
}

/**
 * Calculate video duration from timecodes
 */
function getVideoDurationMs(timecodes: TimecodeEntry[]): number {
  if (!timecodes || timecodes.length === 0) return 0;
  const lastEntry = timecodes[timecodes.length - 1];
  return lastEntry.end || lastEntry.start + (lastEntry.duration || 0);
}

/**
 * Format milliseconds as MM:SS or HH:MM:SS
 */
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export async function handleGetTranscript(strapi: Core.Strapi, args: unknown) {
  const validatedArgs = validateToolInput('get_transcript', args);
  const {
    videoId: videoIdOrUrl,
    includeFullTranscript,
    includeTimecodes,
    startTime,
    endTime,
    chunkIndex,
    chunkSize: chunkSizeOverride,
  } = validatedArgs;

  // Get config
  const pluginConfig = await strapi.config.get('plugin::yt-transcript-strapi-plugin') as PluginConfig | undefined;
  const defaultChunkSize = pluginConfig?.chunkSizeSeconds || 300;
  const previewLength = pluginConfig?.previewLength || 500;
  const maxFullTranscriptLength = pluginConfig?.maxFullTranscriptLength || 50000;
  const chunkSizeSeconds = chunkSizeOverride || defaultChunkSize;

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

  const timecodes: TimecodeEntry[] = transcript.transcriptWithTimeCodes || [];
  const fullText: string = transcript.fullTranscript || '';
  const durationMs = getVideoDurationMs(timecodes);
  const totalChunks = Math.ceil(durationMs / (chunkSizeSeconds * 1000));
  const wordCount = fullText.split(/\s+/).length;

  // Build response based on requested parameters
  const response: Record<string, unknown> = {
    videoId: transcript.videoId,
    title: transcript.title,
    metadata: {
      wordCount,
      characterCount: fullText.length,
      duration: formatTime(durationMs),
      durationSeconds: Math.floor(durationMs / 1000),
      totalChunks,
      chunkSizeSeconds,
    },
  };

  // Handle time range request
  if (startTime !== undefined || endTime !== undefined) {
    const startMs = (startTime || 0) * 1000;
    const endMs = endTime !== undefined ? endTime * 1000 : durationMs;

    const { text, entries } = getTranscriptForTimeRange(timecodes, startMs, endMs);

    response.timeRange = {
      startTime: startTime || 0,
      endTime: endTime || Math.floor(durationMs / 1000),
      startFormatted: formatTime(startMs),
      endFormatted: formatTime(endMs),
    };
    response.transcript = text;

    if (includeTimecodes) {
      response.transcriptWithTimeCodes = entries;
    }
  }
  // Handle chunk request
  else if (chunkIndex !== undefined) {
    const chunkStartMs = chunkIndex * chunkSizeSeconds * 1000;
    const chunkEndMs = Math.min((chunkIndex + 1) * chunkSizeSeconds * 1000, durationMs);

    if (chunkStartMs >= durationMs) {
      response.error = `Chunk index ${chunkIndex} is out of range. Total chunks: ${totalChunks} (0-${totalChunks - 1})`;
    } else {
      const { text, entries } = getTranscriptForTimeRange(timecodes, chunkStartMs, chunkEndMs);

      response.chunk = {
        index: chunkIndex,
        totalChunks,
        startTime: Math.floor(chunkStartMs / 1000),
        endTime: Math.floor(chunkEndMs / 1000),
        startFormatted: formatTime(chunkStartMs),
        endFormatted: formatTime(chunkEndMs),
      };
      response.transcript = text;

      if (includeTimecodes) {
        response.transcriptWithTimeCodes = entries;
      }

      // Add navigation hints
      if (chunkIndex < totalChunks - 1) {
        response.nextChunk = `Use chunkIndex: ${chunkIndex + 1} to get the next portion`;
      }
      if (chunkIndex > 0) {
        response.previousChunk = `Use chunkIndex: ${chunkIndex - 1} to get the previous portion`;
      }
    }
  }
  // Handle full transcript request OR auto-load if small enough
  else if (includeFullTranscript || fullText.length <= maxFullTranscriptLength) {
    response.transcript = fullText;

    if (includeTimecodes) {
      response.transcriptWithTimeCodes = timecodes;
    }

    // Only show warning if explicitly requested full transcript for a large video
    if (includeFullTranscript && fullText.length > maxFullTranscriptLength) {
      response.warning = 'Full transcript included. For long videos, consider using chunkIndex, startTime/endTime, or search_transcript to reduce response size.';
    } else if (fullText.length <= maxFullTranscriptLength) {
      response.note = 'Full transcript auto-loaded (fits within context limit).';
    }
  }
  // Default for large transcripts: return preview only
  else {
    const preview = fullText.length > previewLength
      ? fullText.substring(0, previewLength) + '...'
      : fullText;

    response.preview = preview;
    response.isLargeTranscript = true;
    response.usage = {
      fullTranscript: 'Set includeFullTranscript: true to get complete text (warning: may exceed context)',
      search: 'Use search_transcript to find relevant portions by keyword (recommended for large transcripts)',
      timeRange: 'Use startTime and endTime (in seconds) to get a specific portion',
      pagination: `Use chunkIndex (0-${totalChunks - 1}) to paginate through ${chunkSizeSeconds}s chunks`,
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}
