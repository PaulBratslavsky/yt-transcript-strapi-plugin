#!/usr/bin/env npx ts-node

/**
 * MCP Integration Test Script
 *
 * Tests the yt-transcript MCP server endpoint by simulating a real MCP client.
 *
 * Usage:
 *   npx ts-node scripts/test-mcp.ts [base-url]
 *
 * Examples:
 *   npx ts-node scripts/test-mcp.ts                           # Uses localhost:1337
 *   npx ts-node scripts/test-mcp.ts http://localhost:1337     # Local
 *   npx ts-node scripts/test-mcp.ts https://your-app.strapiapp.com  # Production
 */

const BASE_URL = process.argv[2] || 'http://localhost:1337';
const MCP_ENDPOINT = `${BASE_URL}/api/yt-transcript-strapi-plugin/mcp`;

// Test video - short video for faster testing
const TEST_VIDEO_ID = 'dQw4w9WgXcQ'; // Rick Astley - Never Gonna Give You Up (~3 min)

interface MCPResponse {
  jsonrpc: string;
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

let sessionId: string | null = null;
let requestId = 0;

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  dim: '\x1b[2m',
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message: string) {
  log(`✓ ${message}`, colors.green);
}

function logError(message: string) {
  log(`✗ ${message}`, colors.red);
}

function logInfo(message: string) {
  log(`ℹ ${message}`, colors.blue);
}

function logSection(message: string) {
  console.log();
  log(`━━━ ${message} ━━━`, colors.yellow);
}

async function mcpRequest(method: string, params?: unknown, isNotification = false): Promise<MCPResponse | null> {
  const body: Record<string, unknown> = {
    jsonrpc: '2.0',
    method,
  };

  if (!isNotification) {
    body.id = ++requestId;
  }

  if (params) {
    body.params = params;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };

  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  const response = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  // Capture session ID from response headers
  const newSessionId = response.headers.get('mcp-session-id');
  if (newSessionId) {
    sessionId = newSessionId;
  }

  if (isNotification) {
    return null;
  }

  const text = await response.text();

  // Parse SSE response
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      try {
        return JSON.parse(data);
      } catch {
        // Continue to next line
      }
    }
  }

  // Try parsing as plain JSON
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse response: ${text}`);
  }
}

async function testInitialize(): Promise<boolean> {
  logSection('Testing MCP Initialize');

  try {
    const response = await mcpRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    });

    if (response?.result) {
      const result = response.result as { serverInfo?: { name: string; version: string }; capabilities?: unknown };
      logSuccess(`Connected to ${result.serverInfo?.name} v${result.serverInfo?.version}`);
      log(`  Session ID: ${sessionId}`, colors.dim);

      // Send initialized notification
      await mcpRequest('notifications/initialized', undefined, true);
      logSuccess('Sent initialized notification');

      return true;
    } else {
      logError(`Initialize failed: ${JSON.stringify(response?.error)}`);
      return false;
    }
  } catch (error) {
    logError(`Initialize error: ${error}`);
    return false;
  }
}

async function testListTools(): Promise<boolean> {
  logSection('Testing tools/list');

  try {
    const response = await mcpRequest('tools/list', {});

    if (response?.result) {
      const result = response.result as { tools: Array<{ name: string; description: string }> };
      logSuccess(`Found ${result.tools.length} tools:`);

      for (const tool of result.tools) {
        log(`  • ${tool.name}`, colors.dim);
      }

      // Verify expected tools exist
      const expectedTools = ['fetch_transcript', 'get_transcript', 'search_transcript', 'list_transcripts', 'find_transcripts'];
      const toolNames = result.tools.map(t => t.name);

      for (const expected of expectedTools) {
        if (!toolNames.includes(expected)) {
          logError(`Missing expected tool: ${expected}`);
          return false;
        }
      }

      logSuccess('All expected tools present');
      return true;
    } else {
      logError(`List tools failed: ${JSON.stringify(response?.error)}`);
      return false;
    }
  } catch (error) {
    logError(`List tools error: ${error}`);
    return false;
  }
}

async function testFetchTranscript(): Promise<boolean> {
  logSection('Testing fetch_transcript');

  try {
    logInfo(`Fetching transcript for video: ${TEST_VIDEO_ID}`);

    const response = await mcpRequest('tools/call', {
      name: 'fetch_transcript',
      arguments: { videoId: TEST_VIDEO_ID },
    });

    if (response?.result) {
      const result = response.result as { content: Array<{ text: string }> };
      const data = JSON.parse(result.content[0].text);

      if (data.error) {
        logError(`Fetch failed: ${data.message}`);
        return false;
      }

      logSuccess(`Fetched: "${data.title}"`);
      log(`  Video ID: ${data.videoId}`, colors.dim);
      log(`  Words: ${data.metadata?.wordCount}`, colors.dim);
      log(`  Duration: ${data.metadata?.duration}`, colors.dim);
      log(`  Cached: ${data.cached}`, colors.dim);

      if (data.preview) {
        log(`  Preview: "${data.preview.substring(0, 100)}..."`, colors.dim);
      }

      return true;
    } else {
      logError(`Fetch failed: ${JSON.stringify(response?.error)}`);
      return false;
    }
  } catch (error) {
    logError(`Fetch error: ${error}`);
    return false;
  }
}

async function testGetTranscript(): Promise<boolean> {
  logSection('Testing get_transcript (auto-load)');

  try {
    const response = await mcpRequest('tools/call', {
      name: 'get_transcript',
      arguments: { videoId: TEST_VIDEO_ID },
    });

    if (response?.result) {
      const result = response.result as { content: Array<{ text: string }> };
      const data = JSON.parse(result.content[0].text);

      if (data.error) {
        logError(`Get failed: ${data.message}`);
        return false;
      }

      logSuccess(`Got transcript for: "${data.title}"`);
      log(`  Word count: ${data.metadata?.wordCount}`, colors.dim);
      log(`  Total chunks: ${data.metadata?.totalChunks}`, colors.dim);

      if (data.transcript) {
        logSuccess('Full transcript auto-loaded (fits in context)');
        log(`  Length: ${data.transcript.length} chars`, colors.dim);
      } else if (data.preview) {
        logInfo('Large transcript - preview only');
        log(`  Preview: "${data.preview.substring(0, 80)}..."`, colors.dim);
      }

      return true;
    } else {
      logError(`Get failed: ${JSON.stringify(response?.error)}`);
      return false;
    }
  } catch (error) {
    logError(`Get error: ${error}`);
    return false;
  }
}

async function testGetTranscriptChunk(): Promise<boolean> {
  logSection('Testing get_transcript (chunk pagination)');

  try {
    const response = await mcpRequest('tools/call', {
      name: 'get_transcript',
      arguments: { videoId: TEST_VIDEO_ID, chunkIndex: 0, chunkSize: 60 },
    });

    if (response?.result) {
      const result = response.result as { content: Array<{ text: string }> };
      const data = JSON.parse(result.content[0].text);

      if (data.error) {
        logError(`Get chunk failed: ${data.message}`);
        return false;
      }

      logSuccess(`Got chunk 0 of ${data.chunk?.totalChunks}`);
      log(`  Time range: ${data.chunk?.startFormatted} - ${data.chunk?.endFormatted}`, colors.dim);
      log(`  Transcript length: ${data.transcript?.length} chars`, colors.dim);

      if (data.nextChunk) {
        log(`  Next: ${data.nextChunk}`, colors.dim);
      }

      return true;
    } else {
      logError(`Get chunk failed: ${JSON.stringify(response?.error)}`);
      return false;
    }
  } catch (error) {
    logError(`Get chunk error: ${error}`);
    return false;
  }
}

async function testGetTranscriptTimeRange(): Promise<boolean> {
  logSection('Testing get_transcript (time range)');

  try {
    const response = await mcpRequest('tools/call', {
      name: 'get_transcript',
      arguments: { videoId: TEST_VIDEO_ID, startTime: 30, endTime: 60 },
    });

    if (response?.result) {
      const result = response.result as { content: Array<{ text: string }> };
      const data = JSON.parse(result.content[0].text);

      if (data.error) {
        logError(`Get time range failed: ${data.message}`);
        return false;
      }

      logSuccess(`Got time range: ${data.timeRange?.startFormatted} - ${data.timeRange?.endFormatted}`);
      log(`  Transcript length: ${data.transcript?.length} chars`, colors.dim);

      return true;
    } else {
      logError(`Get time range failed: ${JSON.stringify(response?.error)}`);
      return false;
    }
  } catch (error) {
    logError(`Get time range error: ${error}`);
    return false;
  }
}

async function testSearchTranscript(): Promise<boolean> {
  logSection('Testing search_transcript (BM25)');

  try {
    const searchQuery = 'never gonna give you up';
    logInfo(`Searching for: "${searchQuery}"`);

    const response = await mcpRequest('tools/call', {
      name: 'search_transcript',
      arguments: { videoId: TEST_VIDEO_ID, query: searchQuery, maxResults: 3 },
    });

    if (response?.result) {
      const result = response.result as { content: Array<{ text: string }> };
      const data = JSON.parse(result.content[0].text);

      if (data.error) {
        logError(`Search failed: ${data.message}`);
        return false;
      }

      logSuccess(`Found ${data.matchingResults} results (searched ${data.totalSegments} segments)`);

      if (data.results && data.results.length > 0) {
        for (const result of data.results.slice(0, 3)) {
          log(`  [${result.timeRange}] score: ${result.score}`, colors.dim);
          log(`    "${result.text.substring(0, 80)}..."`, colors.dim);
        }
      }

      return true;
    } else {
      logError(`Search failed: ${JSON.stringify(response?.error)}`);
      return false;
    }
  } catch (error) {
    logError(`Search error: ${error}`);
    return false;
  }
}

async function testListTranscripts(): Promise<boolean> {
  logSection('Testing list_transcripts');

  try {
    const response = await mcpRequest('tools/call', {
      name: 'list_transcripts',
      arguments: { pageSize: 5 },
    });

    if (response?.result) {
      const result = response.result as { content: Array<{ text: string }> };
      const data = JSON.parse(result.content[0].text);

      if (data.error) {
        logError(`List failed: ${data.message}`);
        return false;
      }

      logSuccess(`Listed ${data.results?.length || 0} transcripts (total: ${data.pagination?.total || 0})`);

      if (data.results) {
        for (const transcript of data.results.slice(0, 3)) {
          log(`  • ${transcript.title} (${transcript.videoId})`, colors.dim);
        }
      }

      return true;
    } else {
      logError(`List failed: ${JSON.stringify(response?.error)}`);
      return false;
    }
  } catch (error) {
    logError(`List error: ${error}`);
    return false;
  }
}

async function runTests() {
  console.log();
  log('╔════════════════════════════════════════════╗', colors.yellow);
  log('║   YT-Transcript MCP Integration Tests      ║', colors.yellow);
  log('╚════════════════════════════════════════════╝', colors.yellow);
  log(`Target: ${MCP_ENDPOINT}`, colors.dim);

  const results: { name: string; passed: boolean }[] = [];

  // Run tests in sequence
  results.push({ name: 'Initialize', passed: await testInitialize() });

  if (!results[0].passed) {
    logError('Cannot continue without initialization');
    process.exit(1);
  }

  results.push({ name: 'List Tools', passed: await testListTools() });
  results.push({ name: 'Fetch Transcript', passed: await testFetchTranscript() });
  results.push({ name: 'Get Transcript (auto-load)', passed: await testGetTranscript() });
  results.push({ name: 'Get Transcript (chunk)', passed: await testGetTranscriptChunk() });
  results.push({ name: 'Get Transcript (time range)', passed: await testGetTranscriptTimeRange() });
  results.push({ name: 'Search Transcript (BM25)', passed: await testSearchTranscript() });
  results.push({ name: 'List Transcripts', passed: await testListTranscripts() });

  // Summary
  logSection('Test Summary');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  for (const result of results) {
    if (result.passed) {
      logSuccess(result.name);
    } else {
      logError(result.name);
    }
  }

  console.log();
  if (failed === 0) {
    log(`All ${passed} tests passed! 🎉`, colors.green);
  } else {
    log(`${passed} passed, ${failed} failed`, colors.red);
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Run
runTests().catch((error) => {
  logError(`Fatal error: ${error}`);
  process.exit(1);
});
