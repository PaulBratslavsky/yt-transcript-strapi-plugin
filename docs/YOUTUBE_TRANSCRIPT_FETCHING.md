# YouTube Transcript Fetching: A Deep Dive into the Innertube API Approach

## Overview

This document explains how the `yt-transcript-strapi-plugin` fetches transcripts from YouTube videos. After encountering reliability issues with existing npm libraries, we reverse-engineered the approach used by the popular Python `youtube-transcript-api` library to create a robust, dependency-free Node.js implementation.

**Key Files:**
- `server/src/utils/fetch-transcript.ts` - Core Innertube implementation
- `server/src/services/service.ts` - Service layer wrapping the fetch
- `server/src/controllers/controller.ts` - HTTP endpoint handler

## Table of Contents

1. [The Problem with Existing Libraries](#the-problem-with-existing-libraries)
2. [Why We Built a Custom Solution](#why-we-built-a-custom-solution)
3. [Understanding YouTube's Innertube API](#understanding-youtubes-innertube-api)
4. [Implementation Deep Dive](#implementation-deep-dive)
5. [Service Layer Integration](#service-layer-integration)
6. [Error Handling](#error-handling)
7. [Maintenance Guide](#maintenance-guide)
8. [Troubleshooting](#troubleshooting)

---

## The Problem with Existing Libraries

### Libraries We Tried

We initially attempted to use several popular npm packages for fetching YouTube transcripts:

| Library | Version Tested | Outcome |
|---------|----------------|---------|
| `youtubei.js` | v12.x, v13.x, v16.x | Parser errors, 400 Bad Request responses |
| `youtube-transcript` | Latest | Empty arrays returned |
| `youtube-captions-scraper` | Latest | Empty responses, 0 content-length |

### Why They Failed

YouTube frequently updates their internal APIs and page structures. These libraries rely on:

1. **HTML Scraping** - Parsing YouTube's page HTML to extract embedded JSON data
2. **Undocumented Endpoints** - Using URLs that YouTube can change without notice
3. **Browser-like Requests** - Mimicking web browser behavior, which YouTube actively restricts

When YouTube makes changes, these libraries break until maintainers push updates. This creates an unreliable dependency chain for production applications.

### The Turning Point

While Node.js libraries were failing, we noticed the Python `youtube-transcript-api` library (with 2M+ monthly downloads) continued to work reliably. This led us to investigate their approach.

---

## Why We Built a Custom Solution

### Comparison: Third-Party vs Custom

```mermaid
flowchart TB
    subgraph Third-Party["Third-Party Library Approach"]
        direction TB
        A1[YouTube Changes API] --> A2[Library Breaks]
        A2 --> A3[Wait for Maintainer]
        A3 --> A4[Update Released]
        A4 --> A5[Update Dependencies]
        A5 --> A6[Test & Deploy]
    end

    subgraph Custom["Custom Implementation Approach"]
        direction TB
        B1[YouTube Changes API] --> B2[Identify Issue]
        B2 --> B3[Fix Code Directly]
        B3 --> B4[Test & Deploy]
    end

    style A2 fill:#ffcdd2
    style A3 fill:#fff3e0
    style B3 fill:#c8e6c9
```

### Benefits of the Custom Approach

| Aspect | Third-Party Library | Custom Implementation |
|--------|---------------------|----------------------|
| **Reliability** | Breaks when YouTube changes | Uses battle-tested approach |
| **Dependencies** | External package + transitive deps | Zero external dependencies |
| **Maintenance** | Wait for library updates | Fix issues immediately |
| **Bundle Size** | Adds package weight | ~200 lines of code |
| **Control** | Black box behavior | Full visibility and control |
| **Debugging** | Limited insight | Complete error context |

### The Python Library's Secret

The `youtube-transcript-api` Python library uses YouTube's **Innertube API** with an **Android client context**. This approach:

1. Bypasses many web-based restrictions
2. Uses a more stable internal API
3. Has been reliable for years with minimal changes needed

We reverse-engineered this approach for Node.js.

---

## Understanding YouTube's Innertube API

### What is Innertube?

Innertube is YouTube's internal API used by their mobile apps, smart TVs, and other clients. Unlike the public YouTube Data API (which requires API keys and has quotas), Innertube is the same API that YouTube's own applications use.

### Key Components

```mermaid
flowchart TD
    A[Start: Video ID] --> B[Fetch Video Page HTML]
    B --> C{Consent Form?}
    C -->|Yes| D[Set Consent Cookie]
    D --> B
    C -->|No| E[Extract INNERTUBE_API_KEY]
    E --> F[POST to Innertube Player API]
    F --> G{Playable?}
    G -->|No| H[Throw Error]
    G -->|Yes| I[Get Caption Tracks]
    I --> J{Has Captions?}
    J -->|No| K[Throw: No Captions]
    J -->|Yes| L[Select Best Track]
    L --> M[Fetch Caption XML]
    M --> N[Parse XML to Segments]
    N --> O[Return TranscriptData]

    style A fill:#e1f5fe
    style O fill:#c8e6c9
    style H fill:#ffcdd2
    style K fill:#ffcdd2
```

### Detailed Flow Diagram

```mermaid
sequenceDiagram
    participant Client
    participant Plugin
    participant YouTube Page
    participant Innertube API
    participant Caption Server

    Client->>Plugin: getTranscript(videoId)
    Plugin->>YouTube Page: GET /watch?v={videoId}
    YouTube Page-->>Plugin: HTML with embedded API key

    Plugin->>Plugin: Extract INNERTUBE_API_KEY

    Plugin->>Innertube API: POST /youtubei/v1/player
    Note over Plugin,Innertube API: Android client context
    Innertube API-->>Plugin: Playability + Caption URLs

    Plugin->>Caption Server: GET caption baseUrl
    Caption Server-->>Plugin: TimedText XML

    Plugin->>Plugin: Parse XML to segments
    Plugin-->>Client: TranscriptData
```

### The Android Client Context

The critical insight is using an Android client context:

```typescript
const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
  },
};
```

This tells YouTube's servers that the request is coming from an Android app, which:
- Has different rate limiting rules
- Returns data in a more consistent format
- Bypasses some web-specific restrictions

---

## Implementation Deep Dive

### File Location

```
server/src/utils/fetch-transcript.ts
```

### Step 1: Fetch Video Page HTML

```typescript
async function fetchVideoHtml(videoId: string): Promise<string> {
  let html = await fetchHtml(videoId);

  // Handle EU consent form if present
  if (html.includes('action="https://consent.youtube.com/s"')) {
    const consentMatch = html.match(/name="v" value="(.*?)"/);
    if (consentMatch) {
      html = await fetchHtml(videoId, `CONSENT=YES+${consentMatch[1]}`);
    }
  }

  return html;
}
```

**Why this step?**
- The video page HTML contains the `INNERTUBE_API_KEY` embedded in a script tag
- We also extract the video title from the `<title>` element
- EU users may see a consent form that must be handled

**Headers sent:**
```typescript
{
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}
```

### Step 2: Extract API Key

```typescript
function extractApiKey(html: string): string {
  const match = html.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/);
  if (match && match[1]) {
    return match[1];
  }
  throw new Error('Could not extract INNERTUBE_API_KEY from page');
}
```

**What we're looking for:**
```javascript
// Embedded in YouTube's page JavaScript:
"INNERTUBE_API_KEY":"AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
```

This key is required for Innertube API requests but is not secret - it's the same for all users.

### Step 3: Fetch Innertube Data

```typescript
async function fetchInnertubeData(videoId: string, apiKey: string): Promise<any> {
  const response = await fetch(`${INNERTUBE_API_URL}${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      context: INNERTUBE_CONTEXT,  // Android client context
      videoId,
    }),
  });

  return response.json();
}
```

**API Endpoint:**
```
https://www.youtube.com/youtubei/v1/player?key={apiKey}
```

**Request Body:**
```json
{
  "context": {
    "client": {
      "clientName": "ANDROID",
      "clientVersion": "20.10.38"
    }
  },
  "videoId": "dQw4w9WgXcQ"
}
```

**Response Structure (simplified):**
```json
{
  "playabilityStatus": {
    "status": "OK"
  },
  "captions": {
    "playerCaptionsTracklistRenderer": {
      "captionTracks": [
        {
          "baseUrl": "https://www.youtube.com/api/timedtext?...",
          "languageCode": "en",
          "kind": "asr",  // "asr" = auto-generated, absent = manual
          "name": { "runs": [{ "text": "English" }] }
        }
      ]
    }
  }
}
```

### Step 4: Select Best Caption Track

```typescript
// Priority: Manual English > Auto English > First Available
let track = captionTracks.find((t: any) => t.languageCode === 'en' && t.kind !== 'asr');
if (!track) {
  track = captionTracks.find((t: any) => t.languageCode === 'en');
}
if (!track) {
  track = captionTracks[0];
}
```

**Caption Track Types:**
- `kind === 'asr'` - Auto-generated (Automatic Speech Recognition)
- `kind` absent or other - Manually created captions

### Step 5: Fetch Transcript XML

```typescript
// Remove srv3 format parameter (following Python library pattern)
const captionUrl = track.baseUrl.replace('&fmt=srv3', '');

const captionResponse = await fetch(captionUrl);
const transcriptXml = await captionResponse.text();
```

**Why remove `&fmt=srv3`?**
The `srv3` format returns a different JSON structure. The default XML format (TimedText) is simpler to parse and more reliable.

### Step 6: Parse XML to Segments

```typescript
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
        start: Math.round(start * 1000),      // Convert to milliseconds
        end: Math.round((start + duration) * 1000),
        duration: Math.round(duration * 1000),
      });
    }
  }

  return segments;
}
```

**XML Format Example:**
```xml
<?xml version="1.0" encoding="utf-8" ?>
<transcript>
  <text start="12.645" dur="1.37">So in college,</text>
  <text start="15.349" dur="1.564">I was a government major,</text>
  <text start="16.937" dur="2.462">which means I had to write
a lot of papers.</text>
</transcript>
```

**HTML Entity Decoding:**
```typescript
function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/<[^>]*>/g, '')  // Remove any HTML tags
    .trim();
}
```

---

## Service Layer Integration

The service layer (`server/src/services/service.ts`) wraps the fetch function and maintains backward compatibility with the existing data structure.

### Architecture Overview

```mermaid
flowchart LR
    subgraph Clients
        A[HTTP Request]
        B[MCP Tool Call]
    end

    subgraph Strapi Plugin
        C[Controller]
        D[MCP Handler]
        E[Service Layer]
        F[fetch-transcript.ts]
    end

    subgraph External
        G[YouTube]
        H[Database]
        I[OpenAI API]
    end

    A --> C
    B --> D
    C --> E
    D --> E
    E --> F
    F --> G
    E --> H
    E -.->|Optional| I

    style F fill:#fff3e0
    style G fill:#ffcdd2
    style H fill:#c8e6c9
```

### Request Flow

```mermaid
flowchart TD
    A[Incoming Request] --> B{Transcript in DB?}
    B -->|Yes| C[Return Cached]
    B -->|No| D[Fetch from YouTube]
    D --> E{Success?}
    E -->|No| F[Throw Error]
    E -->|Yes| G{Generate Readable?}
    G -->|Yes| H[Call OpenAI]
    G -->|No| I[Skip]
    H --> J{OpenAI Success?}
    J -->|No| K[Log Warning, Continue]
    J -->|Yes| L[Add to Payload]
    K --> M[Save to Database]
    I --> M
    L --> M
    M --> N[Return Response]
    C --> N

    style C fill:#c8e6c9
    style N fill:#c8e6c9
    style F fill:#ffcdd2
```

### Service Method

```typescript
async getTranscript(identifier: string) {
  console.log("Fetching Transcript - Calling fetchTranscript Service");
  const youtubeIdRegex = /^[a-zA-Z0-9_-]{11}$/;
  const isValid = youtubeIdRegex.test(identifier);
  if (!isValid) return { error: 'Invalid video ID', data: null };

  try {
    const transcriptData = await fetchTranscript(identifier);
    // Return in original format expected by controller
    return {
      title: transcriptData.title,
      fullTranscript: transcriptData.fullTranscript,
      transcriptWithTimeCodes: transcriptData.transcriptWithTimeCodes,
    };
  } catch (error) {
    console.error('Failed to fetch transcript:', error);
    throw error;
  }
}
```

**Important:** The service returns data in the original format (`fullTranscript`, `title`, `transcriptWithTimeCodes`) to maintain backward compatibility with existing code and stored data.

### Controller Integration

The controller (`server/src/controllers/controller.ts`) handles the HTTP endpoint and optionally generates a human-readable transcript:

```typescript
async getTranscript(ctx) {
  // 1. Check if transcript exists in database
  const found = await service.findTranscript(videoId);
  if (found) return (ctx.body = { data: found });

  // 2. Fetch from YouTube
  const transcriptData = await service.getTranscript(videoId);

  // 3. Optionally generate readable transcript (graceful failure)
  let readableTranscript = null;
  try {
    readableTranscript = await service.generateHumanReadableTranscript(
      transcriptData.fullTranscript
    );
  } catch (error) {
    console.log("Failed to generate readable transcript, continuing without it");
    // Continue without readable transcript - OpenAI key may not be configured
  }

  // 4. Save to database
  const payload = {
    videoId,
    title: transcriptData?.title || "No title found",
    fullTranscript: transcriptData?.fullTranscript,
    transcriptWithTimeCodes: transcriptData?.transcriptWithTimeCodes,
    readableTranscript: readableTranscript,
  };

  const transcript = await service.saveTranscript(payload);
  ctx.body = { data: transcript };
}
```

**Key Design Decisions:**
- Readable transcript generation is wrapped in try-catch for graceful failure
- If OpenAI API key is not configured, the transcript is still saved without the readable version
- Existing transcripts are returned from database cache to avoid redundant YouTube API calls

### MCP Tool Integration

The plugin exposes four MCP tools that Claude Desktop and other MCP clients can use:

```mermaid
flowchart LR
    subgraph MCP Client
        A[Claude Desktop]
    end

    subgraph MCP Server
        B[fetch_transcript]
        C[get_transcript]
        D[list_transcripts]
        E[find_transcripts]
    end

    subgraph Backend
        F[Service Layer]
        G[Database]
        H[YouTube API]
    end

    A -->|videoId| B
    A -->|videoId| C
    A -->|pagination| D
    A -->|query| E

    B --> F --> H
    B --> G
    C --> G
    D --> G
    E --> G

    style A fill:#e1f5fe
    style B fill:#fff3e0
    style C fill:#c8e6c9
    style D fill:#c8e6c9
    style E fill:#c8e6c9
```

**Available Tools:**
| Tool | Description |
|------|-------------|
| `fetch_transcript` | Fetch from YouTube and save to database |
| `get_transcript` | Retrieve existing transcript by video ID |
| `list_transcripts` | List all transcripts with pagination |
| `find_transcripts` | Search transcripts by query/title/content |

The MCP tools use the same service layer and data format:

```typescript
// In server/src/mcp/tools/fetch-transcript.ts
const transcriptData = await service.getTranscript(videoId);

if (!transcriptData || !transcriptData.fullTranscript) {
  throw new Error('No transcript data returned from YouTube');
}

const payload = {
  videoId,
  title: transcriptData.title || `YouTube Video ${videoId}`,
  fullTranscript: transcriptData.fullTranscript,
  transcriptWithTimeCodes: transcriptData.transcriptWithTimeCodes,
};
```

---

## Error Handling

### Error Decision Tree

```mermaid
flowchart TD
    A[Error Occurred] --> B{HTTP Status?}
    B -->|429| C[Rate Limited]
    B -->|200| D{Response Valid?}
    B -->|Other| E[Network Error]

    C --> F[Wait & Retry or Use Proxy]

    D -->|No API Key| G[Page Structure Changed]
    D -->|Not Playable| H{Reason?}
    D -->|No Captions| I[Video Has No Transcripts]
    D -->|Empty XML| J[Caption URL Blocked]

    H -->|Age Restricted| K[LOGIN_REQUIRED]
    H -->|Private| L[Video Unavailable]
    H -->|PoToken| M[Authentication Required]

    G --> N[Update Regex Pattern]
    I --> O[Cannot Fetch - Expected]
    J --> P[Retry Request]
    K --> Q[Not Supported]
    L --> O
    M --> Q

    style C fill:#fff3e0
    style F fill:#c8e6c9
    style O fill:#ffcdd2
    style Q fill:#ffcdd2
```

### Error Types and Causes

| Error | Cause | Solution |
|-------|-------|----------|
| `IP blocked by YouTube (rate limited)` | HTTP 429 response | Wait and retry, or use proxy |
| `Could not extract INNERTUBE_API_KEY` | YouTube page structure changed | Update regex pattern |
| `Video not playable: {reason}` | Private, deleted, or region-locked | Cannot fetch transcript |
| `No captions available` | Video has no transcripts | Cannot fetch transcript |
| `PoToken required` | Video requires authentication | Not currently supported |
| `Transcript response was empty` | Caption URL blocked | Retry or check video status |

### Playability Status Handling

```typescript
const playabilityStatus = innertubeData.playabilityStatus;
if (playabilityStatus?.status !== 'OK') {
  const reason = playabilityStatus?.reason || 'Unknown error';
  throw new Error(`Video not playable: ${reason}`);
}
```

**Possible Status Values:**
- `OK` - Video is available
- `ERROR` - Video unavailable
- `LOGIN_REQUIRED` - Age-restricted or private
- `UNPLAYABLE` - Region-locked or other restrictions

### PoToken Detection

Some videos require a "Proof of Origin" token:

```typescript
if (track.baseUrl.includes('&exp=xpe')) {
  throw new Error('This video requires PoToken authentication (not supported)');
}
```

This is a DRM-like protection that requires browser-based authentication and is not currently supported.

---

## Maintenance Guide

### When YouTube Changes Things

**Symptom: API Key Extraction Fails**
```
Error: Could not extract INNERTUBE_API_KEY from page
```

1. Visit any YouTube video page
2. View page source (Ctrl+U)
3. Search for `INNERTUBE_API_KEY`
4. Update the regex pattern in `extractApiKey()` if the format changed

**Symptom: Innertube API Returns Errors**

1. Check if the Android client version needs updating:
   ```typescript
   const INNERTUBE_CONTEXT = {
     client: {
       clientName: 'ANDROID',
       clientVersion: '20.10.38',  // May need updating
     },
   };
   ```

2. Check the Python library's `_settings.py` for their current version:
   ```
   https://github.com/jdepoix/youtube-transcript-api/blob/master/youtube_transcript_api/_settings.py
   ```

**Symptom: XML Parsing Fails**

1. Manually fetch a caption URL and inspect the format
2. Update the regex in `parseTranscriptXml()` if needed

### Version Updates

When updating the Android client version:

1. Check what version the Python library uses
2. Alternatively, use a real Android device to capture the version string
3. Update the `clientVersion` in `INNERTUBE_CONTEXT`

### Testing Changes

```bash
# Quick test script
node -e "
const fetch = require('node-fetch');
const videoId = 'dQw4w9WgXcQ';  // Test video

// ... paste fetch logic here ...
"
```

Or use the test file at `/tmp/test-innertube.js`.

---

## Troubleshooting

### Common Issues

**Issue: Empty transcript returned**
```javascript
segments.length === 0
```

Causes:
1. Video has no captions (check YouTube manually)
2. Caption URL returned empty response (transient, retry)
3. XML format changed (update parser)

**Issue: 429 Too Many Requests**

YouTube is rate limiting your IP. Solutions:
1. Implement exponential backoff
2. Use a proxy rotation service
3. Cache transcripts to reduce requests

**Issue: Consent form keeps appearing**

The EU consent handling may have changed. Check:
1. The consent form action URL
2. The cookie value format
3. Whether additional cookies are needed

### Debug Logging

Enable verbose logging:

```typescript
async function fetchTranscriptFromYouTube(videoId: string): Promise<TranscriptData> {
  console.log('Fetching transcript for video:', videoId);

  const html = await fetchVideoHtml(videoId);
  console.log('HTML length:', html.length);

  const apiKey = extractApiKey(html);
  console.log('API Key:', apiKey);

  const innertubeData = await fetchInnertubeData(videoId, apiKey);
  console.log('Playability:', innertubeData.playabilityStatus?.status);
  console.log('Caption tracks:', innertubeData.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length);

  // ... rest of implementation
}
```

---

## Data Structures

### Entity Relationship

```mermaid
erDiagram
    TranscriptData ||--o{ TranscriptSegment : contains
    TranscriptData {
        string videoId PK
        string title
        string fullTranscript
        string readableTranscript
    }
    TranscriptSegment {
        string text
        number start
        number end
        number duration
    }
```

### Data Flow

```mermaid
flowchart LR
    A[YouTube XML] --> B[Parse]
    B --> C[TranscriptSegment[]]
    C --> D[Join texts]
    D --> E[fullTranscript]
    C --> F[transcriptWithTimeCodes]
    E --> G[TranscriptData]
    F --> G
    G --> H[Database]

    style A fill:#fff3e0
    style G fill:#c8e6c9
    style H fill:#bbdefb
```

### TranscriptSegment

```typescript
interface TranscriptSegment {
  text: string;      // The transcript text for this segment
  start: number;     // Start time in milliseconds
  end: number;       // End time in milliseconds
  duration: number;  // Duration in milliseconds
}
```

### TranscriptData

```typescript
interface TranscriptData {
  videoId: string;                           // YouTube video ID
  title?: string;                            // Video title (from page)
  fullTranscript: string;                    // All segments joined with spaces
  transcriptWithTimeCodes: TranscriptSegment[];  // Individual segments
}
```

---

## References

- [Python youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api) - The library we reverse-engineered
- [YouTube Innertube API](https://github.com/AhmedAGadir/YouTube-Innertube-API-docs) - Community documentation
- [Strapi Plugin Development](https://docs.strapi.io/dev-docs/plugins-development) - Strapi v5 plugin docs

---

## Changelog

### v0.0.14 (December 2024)

- Replaced `youtubei.js` dependency with custom Innertube implementation
- Added Android client context for improved reliability
- Implemented consent cookie handling for EU users
- Added PoToken detection with graceful error handling
- Zero external dependencies for transcript fetching

---

## Contributing

When making changes to the transcript fetching logic:

1. Test with multiple video types:
   - Videos with manual captions
   - Videos with auto-generated captions
   - Videos with multiple language tracks
   - Age-restricted videos (should fail gracefully)
   - Private/deleted videos (should fail gracefully)

2. Compare behavior with the Python library
3. Update this documentation if the implementation changes
