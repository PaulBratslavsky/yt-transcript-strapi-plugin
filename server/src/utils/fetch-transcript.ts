import { Innertube } from 'youtubei.js';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  duration: number;
}

export interface TranscriptData {
  videoId: string;
  title?: string;
  fullTranscript: string;
  transcriptWithTimeCodes: TranscriptSegment[];
}

export interface FetchOptions {
  proxyUrl?: string;
}

/**
 * Create a proxy-enabled fetch function using undici
 */
function createProxyFetch(proxyUrl?: string): typeof fetch | undefined {
  if (!proxyUrl) {
    return undefined;
  }

  const proxyAgent = new ProxyAgent(proxyUrl);

  return (async (input: string | URL | Request, init?: RequestInit) => {
    if (input instanceof Request) {
      const url = input.url;
      return undiciFetch(url, {
        method: input.method,
        headers: input.headers as any,
        body: input.body as any,
        ...init,
        dispatcher: proxyAgent,
      } as any);
    }
    return undiciFetch(input as string, { ...init, dispatcher: proxyAgent } as any);
  }) as typeof fetch;
}

/**
 * Decode HTML entities in transcript text
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Parse <p t="ms" d="ms">text</p> format (Android client)
 */
function parsePTagFormat(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const pTagRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;

  let match = pTagRegex.exec(xml);
  while (match !== null) {
    const [, startMsStr, durationMsStr, rawText] = match;
    if (startMsStr && durationMsStr && rawText) {
      const text = decodeHtmlEntities(rawText);
      if (text) {
        const start = parseInt(startMsStr, 10);
        const duration = parseInt(durationMsStr, 10);
        segments.push({
          text,
          start,
          end: start + duration,
          duration,
        });
      }
    }
    match = pTagRegex.exec(xml);
  }
  return segments;
}

/**
 * Parse <text start="sec" dur="sec">text</text> format (alternative format)
 */
function parseTextTagFormat(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const textTagRegex = /<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;

  let match = textTagRegex.exec(xml);
  while (match !== null) {
    const [, startStr, durStr, rawText] = match;
    if (startStr && rawText) {
      const text = decodeHtmlEntities(rawText);
      if (text) {
        const start = Math.round(parseFloat(startStr) * 1000);
        const duration = Math.round(parseFloat(durStr || '0') * 1000);
        segments.push({
          text,
          start,
          end: start + duration,
          duration,
        });
      }
    }
    match = textTagRegex.exec(xml);
  }
  return segments;
}

/**
 * Parse timedtext XML into transcript segments
 * Supports both <p> format (Android) and <text> format (alternative)
 */
function parseTimedTextXml(xml: string): TranscriptSegment[] {
  // Try <p> tag format first (Android client format)
  const pSegments = parsePTagFormat(xml);
  if (pSegments.length > 0) {
    return pSegments;
  }
  // Fall back to <text> tag format
  return parseTextTagFormat(xml);
}

/**
 * Fetch timedtext XML from caption URL
 */
async function fetchTimedTextXml(
  captionUrl: string,
  proxyFetch?: typeof fetch
): Promise<string> {
  const fetchFn = proxyFetch || fetch;
  const response = await fetchFn(captionUrl, {
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch timedtext: ${response.status}`);
  }

  const xml = await response.text();
  if (!xml || xml.length === 0) {
    throw new Error('Empty timedtext response');
  }

  return xml;
}

/**
 * Fetch transcript using youtubei.js getBasicInfo to get caption URLs
 * This approach uses the Innertube client to get caption track URLs,
 * then fetches timedtext directly - avoiding BotGuard requirements.
 */
async function fetchTranscriptFromYouTube(
  videoId: string,
  options?: FetchOptions
): Promise<TranscriptData> {
  const proxyFetch = createProxyFetch(options?.proxyUrl);

  // 1. Create Innertube client with optional proxy
  const client = await Innertube.create({
    generate_session_locally: true,
    lang: 'en',
    location: 'US',
    retrieve_player: false,
    fetch: proxyFetch,
  });

  // 2. Get basic info (includes caption tracks)
  const info = await client.getBasicInfo(videoId);

  // Get title from basic info
  const title = info.basic_info?.title;

  // 3. Check for caption tracks
  const captionTracks = info.captions?.caption_tracks;
  if (!captionTracks || captionTracks.length === 0) {
    // Check if there's a sign-in requirement
    const reason = (info as any).playability_status?.reason;
    if (reason && reason.includes('Sign in')) {
      throw new Error(
        'YouTube requires sign-in. This usually means the IP is blocked. ' +
          'Configure a residential proxy in the plugin settings.'
      );
    }
    throw new Error('No captions available for this video');
  }

  // 4. Find English caption track (prefer non-ASR if available)
  const englishTrack =
    captionTracks.find((t) => t.language_code === 'en' && t.kind !== 'asr') ||
    captionTracks.find((t) => t.language_code?.startsWith('en')) ||
    captionTracks[0];

  if (!englishTrack?.base_url) {
    throw new Error('No valid caption track URL found');
  }

  // 5. Fetch timedtext XML
  const xml = await fetchTimedTextXml(englishTrack.base_url, proxyFetch);

  // 6. Parse XML to segments
  const segments = parseTimedTextXml(xml);

  if (segments.length === 0) {
    throw new Error('Failed to parse any transcript segments from XML');
  }

  return {
    videoId,
    title,
    fullTranscript: segments.map((s) => s.text).join(' '),
    transcriptWithTimeCodes: segments,
  };
}

/**
 * Main entry point for fetching YouTube transcripts
 * @param videoId - The YouTube video ID
 * @param options - Optional configuration including proxy settings
 */
const fetchTranscript = async (videoId: string, options?: FetchOptions): Promise<TranscriptData> => {
  try {
    return await fetchTranscriptFromYouTube(videoId, options);
  } catch (error) {
    throw new Error(
      `Failed to fetch transcript for video ${videoId}. ` +
        `The video may not have captions enabled, or may be unavailable. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export default fetchTranscript;
