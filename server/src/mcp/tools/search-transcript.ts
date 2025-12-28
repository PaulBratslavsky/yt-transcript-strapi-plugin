import type { Core } from '@strapi/strapi';
import { validateToolInput } from '../schemas';
import { extractYouTubeID } from '../../utils/extract-youtube-id';

interface PluginConfig {
  searchSegmentSeconds?: number;
}

interface TimecodeEntry {
  start: number;
  end: number;
  text: string;
  duration: number;
}

interface SearchSegment {
  text: string;
  startTime: number;
  endTime: number;
  startFormatted: string;
  endFormatted: string;
}

interface ScoredSegment extends SearchSegment {
  score: number;
}

export const searchTranscriptTool = {
  name: 'search_transcript',
  description:
    'Search within a saved transcript using BM25 scoring. Returns the most relevant segments matching your query with timestamps. Use this to find specific content in long videos without loading the entire transcript.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      videoId: {
        type: 'string',
        description: 'YouTube video ID (e.g., "dQw4w9WgXcQ") or full YouTube URL',
      },
      query: {
        type: 'string',
        description: 'Search query - keywords or phrases to find in the transcript',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5, max: 20)',
        default: 5,
      },
    },
    required: ['videoId', 'query'],
  },
};

/**
 * Tokenize text into lowercase words
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

/**
 * Calculate IDF (Inverse Document Frequency) for each term
 */
function calculateIDF(segments: SearchSegment[], vocabulary: Set<string>): Map<string, number> {
  const idf = new Map<string, number>();
  const N = segments.length;

  for (const term of vocabulary) {
    const docsWithTerm = segments.filter((seg) =>
      tokenize(seg.text).includes(term)
    ).length;
    // BM25 IDF formula: log((N - n + 0.5) / (n + 0.5) + 1)
    idf.set(term, Math.log((N - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1));
  }

  return idf;
}

/**
 * Calculate BM25 score for a segment against a query
 */
function bm25Score(
  segmentTokens: string[],
  queryTokens: string[],
  idf: Map<string, number>,
  avgDocLength: number,
  k1 = 1.5,
  b = 0.75
): number {
  const docLength = segmentTokens.length;
  let score = 0;

  // Count term frequencies in segment
  const tf = new Map<string, number>();
  for (const token of segmentTokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  for (const term of queryTokens) {
    const termFreq = tf.get(term) || 0;
    const termIdf = idf.get(term) || 0;

    if (termFreq > 0) {
      // BM25 scoring formula
      const numerator = termFreq * (k1 + 1);
      const denominator = termFreq + k1 * (1 - b + b * (docLength / avgDocLength));
      score += termIdf * (numerator / denominator);
    }
  }

  return score;
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

/**
 * Split transcript timecodes into segments of specified duration
 */
function createSegments(
  timecodes: TimecodeEntry[],
  segmentDurationMs: number
): SearchSegment[] {
  if (!timecodes || timecodes.length === 0) return [];

  const segments: SearchSegment[] = [];
  let currentSegment: TimecodeEntry[] = [];
  let segmentStartTime = timecodes[0].start;

  for (const entry of timecodes) {
    const segmentEndTime = segmentStartTime + segmentDurationMs;

    if (entry.start < segmentEndTime) {
      currentSegment.push(entry);
    } else {
      // Save current segment
      if (currentSegment.length > 0) {
        const endTime = currentSegment[currentSegment.length - 1].end ||
          currentSegment[currentSegment.length - 1].start + (currentSegment[currentSegment.length - 1].duration || 0);
        segments.push({
          text: currentSegment.map((e) => e.text).join(' '),
          startTime: Math.floor(segmentStartTime / 1000),
          endTime: Math.floor(endTime / 1000),
          startFormatted: formatTime(segmentStartTime),
          endFormatted: formatTime(endTime),
        });
      }

      // Start new segment
      segmentStartTime = entry.start;
      currentSegment = [entry];
    }
  }

  // Don't forget the last segment
  if (currentSegment.length > 0) {
    const endTime = currentSegment[currentSegment.length - 1].end ||
      currentSegment[currentSegment.length - 1].start + (currentSegment[currentSegment.length - 1].duration || 0);
    segments.push({
      text: currentSegment.map((e) => e.text).join(' '),
      startTime: Math.floor(segmentStartTime / 1000),
      endTime: Math.floor(endTime / 1000),
      startFormatted: formatTime(segmentStartTime),
      endFormatted: formatTime(endTime),
    });
  }

  return segments;
}

export async function handleSearchTranscript(strapi: Core.Strapi, args: unknown) {
  const validatedArgs = validateToolInput('search_transcript', args);
  const { videoId: videoIdOrUrl, query, maxResults: maxResultsInput } = validatedArgs;

  // Get config
  const pluginConfig = await strapi.config.get('plugin::yt-transcript-strapi-plugin') as PluginConfig | undefined;
  const segmentSeconds = pluginConfig?.searchSegmentSeconds || 30;

  // Clamp maxResults
  const maxResults = Math.min(Math.max(maxResultsInput || 5, 1), 20);

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

  if (timecodes.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: true,
              message: 'Transcript has no timecode data for searching.',
              videoId,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Create segments from timecodes
  const segments = createSegments(timecodes, segmentSeconds * 1000);

  if (segments.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: true,
              message: 'Could not create searchable segments from transcript.',
              videoId,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Tokenize query
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: true,
              message: 'Query is empty or contains only stop words.',
              query,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Build vocabulary from query terms
  const vocabulary = new Set(queryTokens);

  // Calculate IDF
  const idf = calculateIDF(segments, vocabulary);

  // Calculate average document length
  const avgDocLength = segments.reduce((sum, seg) => sum + tokenize(seg.text).length, 0) / segments.length;

  // Score all segments
  const scoredSegments: ScoredSegment[] = segments.map((segment) => ({
    ...segment,
    score: bm25Score(tokenize(segment.text), queryTokens, idf, avgDocLength),
  }));

  // Filter and sort by score
  const results = scoredSegments
    .filter((seg) => seg.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            videoId: transcript.videoId,
            title: transcript.title,
            query,
            totalSegments: segments.length,
            matchingResults: results.length,
            results: results.map((r) => ({
              text: r.text,
              startTime: r.startTime,
              endTime: r.endTime,
              timeRange: `${r.startFormatted} - ${r.endFormatted}`,
              score: Math.round(r.score * 100) / 100,
            })),
            usage: results.length > 0
              ? `Use get_transcript with startTime: ${results[0].startTime} and endTime: ${results[0].endTime} to get full context for the top result.`
              : 'No matches found. Try different keywords.',
          },
          null,
          2
        ),
      },
    ],
  };
}
