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

// Innertube API configuration (same as Python youtube-transcript-api library)
const WATCH_URL = 'https://www.youtube.com/watch?v=';
const INNERTUBE_API_URL = 'https://www.youtube.com/youtubei/v1/player?key=';
const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
  },
};

/**
 * Decode HTML entities in transcript text
 */
function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/<[^>]*>/g, '')
    .trim();
}

/**
 * Extract INNERTUBE_API_KEY from YouTube page HTML
 */
function extractApiKey(html: string): string {
  const match = html.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/);
  if (match && match[1]) {
    return match[1];
  }
  throw new Error('Could not extract INNERTUBE_API_KEY from page');
}

/**
 * Fetch video HTML and handle EU consent cookie if needed
 */
async function fetchVideoHtml(videoId: string): Promise<string> {
  let html = await fetchHtml(videoId);

  // Handle consent form if present (EU users)
  if (html.includes('action="https://consent.youtube.com/s"')) {
    const consentMatch = html.match(/name="v" value="(.*?)"/);
    if (consentMatch) {
      html = await fetchHtml(videoId, `CONSENT=YES+${consentMatch[1]}`);
    }
  }

  return html;
}

async function fetchHtml(videoId: string, cookie?: string): Promise<string> {
  const headers: Record<string, string> = {
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  if (cookie) {
    headers['Cookie'] = cookie;
  }

  const response = await fetch(`${WATCH_URL}${videoId}`, { headers });

  if (response.status === 429) {
    throw new Error('IP blocked by YouTube (rate limited)');
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch video page: ${response.status}`);
  }

  return response.text();
}

/**
 * Fetch video data using Innertube API with Android client context
 */
async function fetchInnertubeData(videoId: string, apiKey: string): Promise<any> {
  const response = await fetch(`${INNERTUBE_API_URL}${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      context: INNERTUBE_CONTEXT,
      videoId,
    }),
  });

  if (response.status === 429) {
    throw new Error('IP blocked by YouTube (rate limited)');
  }

  if (!response.ok) {
    throw new Error(`Innertube API request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Parse TimedText XML transcript format
 */
function parseTranscriptXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const regex = /<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;

  let match;
  while ((match = regex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const duration = parseFloat(match[2] || '0');
    const text = decodeHtml(match[3]);

    if (text) {
      segments.push({
        text,
        start: Math.round(start * 1000),
        end: Math.round((start + duration) * 1000),
        duration: Math.round(duration * 1000),
      });
    }
  }

  return segments;
}

/**
 * Fetch transcript from YouTube using Innertube API
 * This approach is reverse-engineered from the Python youtube-transcript-api library
 */
async function fetchTranscriptFromYouTube(videoId: string): Promise<TranscriptData> {
  // Step 1: Fetch video page to get API key
  const html = await fetchVideoHtml(videoId);

  // Extract title from page
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : undefined;

  // Step 2: Extract API key
  const apiKey = extractApiKey(html);

  // Step 3: Fetch data from Innertube API
  const innertubeData = await fetchInnertubeData(videoId, apiKey);

  // Check playability
  const playabilityStatus = innertubeData.playabilityStatus;
  if (playabilityStatus?.status !== 'OK') {
    const reason = playabilityStatus?.reason || 'Unknown error';
    throw new Error(`Video not playable: ${reason}`);
  }

  // Step 4: Get caption tracks
  const captions = innertubeData.captions?.playerCaptionsTracklistRenderer;
  if (!captions?.captionTracks || captions.captionTracks.length === 0) {
    throw new Error('No captions available for this video');
  }

  const captionTracks = captions.captionTracks;

  // Find best caption track (prefer manual English, then auto English, then first)
  let track = captionTracks.find((t: any) => t.languageCode === 'en' && t.kind !== 'asr');
  if (!track) {
    track = captionTracks.find((t: any) => t.languageCode === 'en');
  }
  if (!track) {
    track = captionTracks[0];
  }

  // Check for PoToken requirement
  if (track.baseUrl.includes('&exp=xpe')) {
    throw new Error('This video requires PoToken authentication (not supported)');
  }

  // Step 5: Fetch transcript XML (remove srv3 format parameter)
  const captionUrl = track.baseUrl.replace('&fmt=srv3', '');

  const captionResponse = await fetch(captionUrl);
  if (!captionResponse.ok) {
    throw new Error(`Failed to fetch transcript: ${captionResponse.status}`);
  }

  const transcriptXml = await captionResponse.text();

  if (!transcriptXml || transcriptXml.length === 0) {
    throw new Error('Transcript response was empty');
  }

  // Step 6: Parse XML
  const segments = parseTranscriptXml(transcriptXml);

  if (segments.length === 0) {
    throw new Error('Failed to parse any transcript segments');
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
 */
const fetchTranscript = async (videoId: string): Promise<TranscriptData> => {
  try {
    return await fetchTranscriptFromYouTube(videoId);
  } catch (error) {
    throw new Error(
      `Failed to fetch transcript for video ${videoId}. ` +
        `The video may not have captions enabled, or may be unavailable. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export default fetchTranscript;
