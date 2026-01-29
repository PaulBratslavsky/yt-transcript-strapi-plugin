import { Innertube } from 'youtubei.js';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

const PROXY_URL = process.env.PROXY_URL;
if (!PROXY_URL) {
  console.error('Error: PROXY_URL environment variable is required');
  process.exit(1);
}
const VIDEO_ID = process.argv[2] || '2xNBG-KI50Q';

console.log('Testing transcript fetch...');
console.log(`Video ID: ${VIDEO_ID}`);
console.log(`Proxy URL: ${PROXY_URL.replace(/:([^@:]+)@/, ':****@')}`);

// Create proxy fetch
const proxyAgent = new ProxyAgent(PROXY_URL);
const DEBUG = process.env.DEBUG === '1';

const proxyFetch = async (input, init = {}) => {
  let url, method, headers, body;

  if (DEBUG) {
    console.log(`[DEBUG] Input type: ${input?.constructor?.name || typeof input}`);
    console.log(`[DEBUG] Init keys: ${Object.keys(init).join(', ') || 'none'}`);
  }

  // Handle Request objects
  if (input instanceof Request) {
    const request = input;
    url = request.url;
    method = init.method || request.method || 'GET';

    // Convert Request headers to plain object
    headers = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Merge with init headers (init takes precedence)
    if (init.headers) {
      const initHeaders = init.headers instanceof Headers
        ? Object.fromEntries(init.headers.entries())
        : init.headers;
      headers = { ...headers, ...initHeaders };
    }

    // Prefer body from init, otherwise read from request
    if (init.body !== undefined) {
      body = init.body;
    } else if (method !== 'GET' && method !== 'HEAD') {
      try {
        body = await request.text();
      } catch (e) {
        if (DEBUG) console.log('[DEBUG] Error reading request body:', e.message);
      }
    }
  } else {
    // Handle string/URL with init options
    url = typeof input === 'string' ? input : input.toString();
    method = init.method || 'GET';
    headers = init.headers || {};
    body = init.body;
  }

  if (DEBUG) {
    console.log(`\n[DEBUG] ${method} ${url}`);
    if (method !== 'GET') {
      console.log('[DEBUG] Headers:', JSON.stringify(headers, null, 2));
      console.log('[DEBUG] Body:', typeof body === 'string' ? body.substring(0, 1000) : body);
    }
  }

  const options = {
    method,
    headers,
    dispatcher: proxyAgent,
  };

  if (body && method !== 'GET' && method !== 'HEAD') {
    options.body = body;
  }

  const response = await undiciFetch(url, options);

  if (DEBUG && !response.ok) {
    const text = await response.clone().text();
    console.log(`[DEBUG] Response ${response.status}: ${text.substring(0, 500)}`);
  }

  return response;
};

try {
  // First test proxy connectivity
  console.log('\n1. Testing proxy connectivity...');
  const ipResponse = await proxyFetch('https://httpbin.org/ip');
  const ipData = await ipResponse.json();
  console.log(`   ✓ Proxy working - Outbound IP: ${ipData.origin}`);

  // Create Innertube client
  console.log('\n2. Creating YouTube client...');
  const client = await Innertube.create({
    generate_session_locally: true,
    lang: 'en',
    location: 'US',
    retrieve_player: true,
    fetch: proxyFetch,
  });
  console.log('   ✓ Client created');

  // Get video info
  console.log(`\n3. Fetching video info for ${VIDEO_ID}...`);
  const info = await client.getBasicInfo(VIDEO_ID);

  console.log(`   Title: ${info.basic_info?.title || 'Unknown'}`);
  console.log(`   Channel: ${info.basic_info?.author || 'Unknown'}`);

  // Check playability
  const playability = info.playability_status;
  console.log(`   Playability status: ${playability?.status || 'Unknown'}`);
  if (playability?.reason) {
    console.log(`   Playability reason: ${playability.reason}`);
  }

  // Check captions
  const captionTracks = info.captions?.caption_tracks;
  console.log(`\n4. Caption tracks found: ${captionTracks?.length || 0}`);

  if (captionTracks && captionTracks.length > 0) {
    console.log('   Available languages:');
    captionTracks.forEach((track, i) => {
      console.log(`   - ${track.language_code}${track.kind === 'asr' ? ' (auto-generated)' : ''}: ${track.name?.text || 'unnamed'}`);
    });

    // Try to fetch the first caption track
    const track = captionTracks[0];
    console.log(`\n5. Fetching caption track: ${track.language_code}...`);
    const captionResponse = await proxyFetch(track.base_url);
    const captionXml = await captionResponse.text();
    console.log(`   ✓ Received ${captionXml.length} characters of caption data`);
    console.log(`   First 500 chars: ${captionXml.substring(0, 500)}...`);
  } else {
    console.log('\n   ✗ No captions available for this video');
    console.log('\n   Full playability_status:');
    console.log(JSON.stringify(playability, null, 2));
  }

} catch (error) {
  console.error('\n✗ Error:', error.message);
  if (error.stack) {
    console.error('\nStack trace:', error.stack);
  }
}
