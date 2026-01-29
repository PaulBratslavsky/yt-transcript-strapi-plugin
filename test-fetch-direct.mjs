#!/usr/bin/env node

/**
 * Direct test of fetch-transcript utility
 * Tests the same code path as the plugin but without Strapi
 */

import { Innertube } from 'youtubei.js';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

const PROXY_URL = process.env.PROXY_URL;
const VIDEO_ID = process.argv[2] || 'w7o355LsM9I';

console.log('=== Direct Fetch Transcript Test ===\n');
console.log(`Video ID: ${VIDEO_ID}`);
console.log(`Proxy URL: ${PROXY_URL ? PROXY_URL.replace(/:([^@:]+)@/, ':****@') : 'NOT SET'}`);

// Replicate the createProxyFetch function from the plugin
function createProxyFetch(proxyUrl) {
  if (!proxyUrl) {
    console.log('\n⚠ No proxy configured - using direct connection');
    return undefined;
  }

  const proxyAgent = new ProxyAgent(proxyUrl);
  const maskedProxyUrl = proxyUrl.replace(/:([^@:]+)@/, ':****@');

  return async (input, init = {}) => {
    let url, method, headers = {}, body;

    // Check for Request-like objects
    if (input && typeof input === 'object' && 'url' in input && 'method' in input) {
      const request = input;
      url = request.url;
      method = init.method || request.method || 'GET';

      if (request.headers && typeof request.headers.forEach === 'function') {
        request.headers.forEach((value, key) => {
          headers[key] = value;
        });
      }

      if (init.headers) {
        const initHeaders = init.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : init.headers;
        headers = { ...headers, ...initHeaders };
      }

      if (init.body !== undefined) {
        body = init.body;
      } else if (method !== 'GET' && method !== 'HEAD' && request.body) {
        try {
          const cloned = request.clone();
          body = await cloned.text();
        } catch {}
      }
    } else {
      url = input instanceof URL ? input.toString() : input;
      method = init.method || 'GET';
      if (init.headers) {
        headers = init.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : init.headers;
      }
      body = init.body;
    }

    const options = {
      method,
      headers,
      dispatcher: proxyAgent,
    };

    if (body && method !== 'GET' && method !== 'HEAD') {
      options.body = body;
    }

    // Log request
    const urlPath = new URL(url).pathname;
    console.log(`  [proxy] ${method} ${urlPath}`);

    const response = await undiciFetch(url, options);

    if (!response.ok) {
      console.log(`  [proxy] Response: ${response.status} ${response.statusText}`);
    }

    return response;
  };
}

// Replicate parseTimedTextXml
function decodeHtmlEntities(text) {
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

function parseTextTagFormat(xml) {
  const segments = [];
  const textTagRegex = /<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;

  let match;
  while ((match = textTagRegex.exec(xml)) !== null) {
    const [, startStr, durStr, rawText] = match;
    if (startStr && rawText) {
      const text = decodeHtmlEntities(rawText);
      if (text) {
        const start = Math.round(parseFloat(startStr) * 1000);
        const duration = Math.round(parseFloat(durStr || '0') * 1000);
        segments.push({ text, start, end: start + duration, duration });
      }
    }
  }
  return segments;
}

async function fetchTranscript(videoId, options = {}) {
  const proxyFetch = createProxyFetch(options.proxyUrl);

  console.log('\n1. Creating Innertube client...');
  const client = await Innertube.create({
    generate_session_locally: true,
    lang: 'en',
    location: 'US',
    retrieve_player: true,
    fetch: proxyFetch,
  });
  console.log('   ✓ Client created');

  console.log(`\n2. Fetching video info for ${videoId}...`);
  const info = await client.getBasicInfo(videoId);

  const title = info.basic_info?.title;
  const playabilityStatus = info.playability_status;
  const captionTracks = info.captions?.caption_tracks;

  console.log(`   Title: ${title || 'Unknown'}`);
  console.log(`   Playability: ${playabilityStatus?.status || 'Unknown'}`);
  console.log(`   Caption tracks: ${captionTracks?.length || 0}`);

  if (!captionTracks || captionTracks.length === 0) {
    const reason = playabilityStatus?.reason;
    console.log(`\n   ✗ No captions found`);
    console.log(`   Playability status: ${playabilityStatus?.status}`);
    if (reason) console.log(`   Reason: ${reason}`);

    // Log full playability for debugging
    console.log('\n   Full playability_status:');
    console.log(JSON.stringify(playabilityStatus, null, 2));

    throw new Error('No captions available');
  }

  const availableLanguages = captionTracks.map(t =>
    `${t.language_code}${t.kind === 'asr' ? ' (auto)' : ''}`
  );
  console.log(`   Languages: ${availableLanguages.join(', ')}`);

  const englishTrack =
    captionTracks.find(t => t.language_code === 'en' && t.kind !== 'asr') ||
    captionTracks.find(t => t.language_code?.startsWith('en')) ||
    captionTracks[0];

  if (!englishTrack?.base_url) {
    throw new Error('No valid caption track URL');
  }

  console.log(`\n3. Fetching caption track: ${englishTrack.language_code}...`);
  const fetchFn = proxyFetch || fetch;
  const response = await fetchFn(englishTrack.base_url, {
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch captions: ${response.status}`);
  }

  const xml = await response.text();
  console.log(`   ✓ Received ${xml.length} characters`);

  const segments = parseTextTagFormat(xml);
  console.log(`   ✓ Parsed ${segments.length} segments`);

  const fullTranscript = segments.map(s => s.text).join(' ');
  console.log(`   ✓ Full transcript: ${fullTranscript.length} characters`);

  return { videoId, title, fullTranscript, segments };
}

// Run test
console.log('\n--- Starting fetch ---\n');

try {
  const result = await fetchTranscript(VIDEO_ID, { proxyUrl: PROXY_URL });

  console.log('\n=== SUCCESS ===');
  console.log(`Title: ${result.title}`);
  console.log(`Segments: ${result.segments.length}`);
  console.log(`Transcript length: ${result.fullTranscript.length} chars`);
  console.log(`\nFirst 200 chars:\n${result.fullTranscript.substring(0, 200)}...`);

} catch (error) {
  console.error('\n=== FAILED ===');
  console.error(`Error: ${error.message}`);
  if (error.stack) {
    console.error('\nStack:', error.stack);
  }
}
