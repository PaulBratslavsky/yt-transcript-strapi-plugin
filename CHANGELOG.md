# Changelog

All notable changes to the `yt-transcript-strapi-plugin` will be documented in this file.

## [0.0.15] - 2024-12-20

### Changed

- **Cleanup for npm publishing**: Removed unused dependencies and debug code
  - Removed `@distube/ytdl-core`, `youtube-captions-scraper`, `youtube-transcript`, `youtubei.js`
  - Removed debug player-script.js files (~14MB)
  - Cleaned up console.log statements from controller, service, and fetch-transcript
  - Added `.npmignore` to exclude dev files from package

---

## [0.0.14] - 2024-12-20

### Added

- **MCP (Model Context Protocol) Support**: Full MCP integration with HTTP/SSE transport
  - `fetch_transcript` - Fetch and save YouTube transcripts
  - `list_transcripts` - List all saved transcripts with pagination
  - `get_transcript` - Retrieve a specific transcript by video ID
  - `find_transcripts` - Search transcripts by query, title, or video ID

- **Custom Innertube API Implementation**: Replaced unreliable npm libraries with a robust, dependency-free solution
  - Reverse-engineered from the proven Python `youtube-transcript-api` library
  - Uses Android client context for improved reliability
  - Zero external dependencies for transcript fetching
  - Handles EU consent cookies automatically

- **Comprehensive Documentation**: Added detailed technical documentation
  - See `docs/YOUTUBE_TRANSCRIPT_FETCHING.md` for implementation details
  - Includes maintenance guide, service layer integration, and troubleshooting section

### Changed

- **Transcript Fetching**: Complete rewrite of the fetch mechanism
  - Removed dependency on `youtubei.js` (was failing with parser errors)
  - Removed dependency on `youtube-transcript` (was returning empty results)
  - Now uses YouTube's Innertube API directly with Android client context

- **Service Layer**: Maintains backward-compatible data structure
  - Returns original format: `{ title, fullTranscript, transcriptWithTimeCodes }`
  - Preserves compatibility with existing stored data and controller code

- **Controller**: Improved error handling for readable transcript generation
  - Wrapped OpenAI-based readable transcript generation in try-catch
  - Gracefully continues without readable transcript if OpenAI is not configured
  - Prevents failures from blocking transcript saving

### Technical Details

The new transcript fetching approach:

1. Fetches video page HTML to extract `INNERTUBE_API_KEY`
2. POSTs to Innertube API (`/youtubei/v1/player`) with Android client context
3. Extracts caption track URLs from response
4. Fetches and parses TimedText XML format
5. Returns segments with text, start time, end time, and duration

Key configuration:
```typescript
const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
  },
};
```

### Migration Notes

No breaking changes for existing database content. The transcript data structure remains the same:

```typescript
interface TranscriptData {
  videoId: string;
  title?: string;
  fullTranscript: string;
  transcriptWithTimeCodes: TranscriptSegment[];
}
```

---

## [0.0.13] and earlier

Initial releases with `youtubei.js` dependency for transcript fetching.
