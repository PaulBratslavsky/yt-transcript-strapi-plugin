# YouTube Transcript Strapi Plugin

A Strapi v5 plugin that extracts transcripts from YouTube videos and exposes them via MCP (Model Context Protocol) for AI assistants like ChatGPT and Claude.

## What It Does

This plugin allows AI assistants to:

- **Fetch transcripts** from any YouTube video with captions (auto-generated or manual)
- **Store transcripts** in Strapi's database for faster repeated access
- **Search within transcripts** using BM25 relevance scoring
- **Paginate long transcripts** in time-based chunks to manage token usage
- **List and find stored transcripts** across your Strapi instance

The plugin uses YouTube's internal API via `youtubei.js` to extract caption data, parsing the timedtext XML to provide accurate timestamps for each segment.

## Installation

```bash
npm install yt-transcript-strapi-plugin
```

Or with yarn:

```bash
yarn add yt-transcript-strapi-plugin
```

## Setup in Strapi

### 1. Enable the Plugin

Add the plugin to your Strapi configuration in `config/plugins.ts` (or `config/plugins.js`):

```typescript
export default () => ({
  'yt-transcript-strapi-plugin': {
    enabled: true,
    config: {
      // See Configuration section below
    },
  },
});
```

### 2. Rebuild Strapi

After adding the plugin, rebuild your Strapi application:

```bash
npm run build
npm run develop
```

### 3. Configure Permissions

Go to **Settings > Users & Permissions > Roles** in the Strapi admin panel.

For the **Public** role (or your preferred role), enable:
- `yt-transcript-strapi-plugin` > `mcp` (for MCP endpoint access)

Alternatively, use **API Tokens** for authentication (recommended for production).

## Configuration

All configuration options with their defaults:

```typescript
export default () => ({
  'yt-transcript-strapi-plugin': {
    enabled: true,
    config: {
      // Proxy URL for YouTube requests (recommended for production)
      proxyUrl: process.env.PROXY_URL || '',

      // Chunk size for transcript pagination (default: 5 minutes)
      chunkSizeSeconds: 300,

      // Preview length in characters (default: 500)
      previewLength: 500,

      // Auto-load full transcript if under this character count (default: 50000)
      maxFullTranscriptLength: 50000,

      // Segment size for search scoring in seconds (default: 30)
      searchSegmentSeconds: 30,
    },
  },
});
```

### Configuration Options Explained

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `proxyUrl` | string | `''` | HTTP/HTTPS proxy URL for YouTube requests |
| `chunkSizeSeconds` | number | `300` | Time-based chunk size for paginating transcripts (min: 30) |
| `previewLength` | number | `500` | Number of characters to include in transcript previews (min: 100) |
| `maxFullTranscriptLength` | number | `50000` | Transcripts under this length are returned in full (min: 1000) |
| `searchSegmentSeconds` | number | `30` | Segment duration for BM25 search scoring (min: 10) |

## Proxy Configuration

### Why Use a Proxy?

YouTube may block requests from server IPs, especially:
- Cloud hosting providers (AWS, GCP, Azure, etc.)
- Data center IPs
- IPs with high request volumes

If you see errors like "YouTube requires sign-in" or empty responses, you likely need a proxy.

### Setting Up a Proxy

1. **Get a residential proxy** from a provider like:
   - Bright Data
   - Oxylabs
   - Smartproxy
   - IPRoyal

2. **Configure the proxy URL** in your environment:

```bash
# .env file
PROXY_URL=http://username:password@proxy.example.com:8080
```

3. **Reference it in your plugin config**:

```typescript
export default () => ({
  'yt-transcript-strapi-plugin': {
    enabled: true,
    config: {
      proxyUrl: process.env.PROXY_URL,
    },
  },
});
```

### Proxy URL Format

```
http://username:password@hostname:port
https://username:password@hostname:port
```

The plugin masks credentials in logs (showing `****` instead of the password).

### Testing Without a Proxy

For local development, you may not need a proxy if your home IP isn't blocked. The plugin works without a proxy configured—it will make direct requests to YouTube.

## MCP Endpoint

The plugin exposes an MCP-compatible endpoint at:

```
/api/yt-transcript-strapi-plugin/mcp
```

This endpoint implements the Model Context Protocol for AI assistant integration.

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `fetch_transcript` | Fetch and store a transcript from a YouTube URL or video ID |
| `get_transcript` | Get a stored transcript by ID (supports chunked pagination) |
| `list_transcripts` | List all stored transcripts with pagination |
| `find_transcripts` | Find transcripts by video ID or search term |
| `search_transcript` | Search within a specific transcript using BM25 scoring |

### Tool Details

#### `fetch_transcript`
Fetches a transcript from YouTube and stores it in the database.

**Parameters:**
- `url` (string, required): YouTube URL or video ID

**Returns:** Transcript data with video title, full text, and timestamped segments.

#### `get_transcript`
Retrieves a stored transcript, optionally paginated by time chunks.

**Parameters:**
- `id` (number, required): Transcript database ID
- `chunk` (number, optional): Chunk index for pagination (0-based)

#### `search_transcript`
Searches within a transcript using BM25 relevance scoring.

**Parameters:**
- `id` (number, required): Transcript database ID
- `query` (string, required): Search terms

**Returns:** Ranked segments matching the query with timestamps.

## Authentication

### Option 1: API Token (Recommended)

Create an API token in Strapi Admin:

1. Go to **Settings > API Tokens**
2. Click **Create new API Token**
3. Give it a name and select appropriate permissions
4. Copy the token

Use the token in requests:

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
  https://your-strapi.com/api/yt-transcript-strapi-plugin/mcp
```

### Option 2: OAuth 2.0 (for ChatGPT)

For ChatGPT integration, use with the `strapi-oauth-mcp-manager` plugin:

1. Install and enable `strapi-oauth-mcp-manager`
2. Create an OAuth client in Strapi admin
3. Configure ChatGPT with the OAuth credentials

The plugin automatically registers with the OAuth manager on startup.

## Connecting AI Assistants

### Claude Desktop

Add to your Claude Desktop config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "youtube-transcripts": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-strapi.com/api/yt-transcript-strapi-plugin/mcp",
        "--header",
        "Authorization: Bearer YOUR_STRAPI_API_TOKEN"
      ]
    }
  }
}
```

### ChatGPT

Use the OAuth flow with `strapi-oauth-mcp-manager`. Configure your ChatGPT plugin with:

- **MCP Server URL:** `https://your-strapi.com/api/yt-transcript-strapi-plugin/mcp`
- **OAuth Client ID:** From Strapi OAuth manager
- **OAuth Client Secret:** From Strapi OAuth manager

## Example Usage

Once connected, you can ask your AI assistant:

- "Get the transcript from https://youtube.com/watch?v=VIDEO_ID"
- "Search for mentions of 'machine learning' in transcript #5"
- "List all stored transcripts"
- "Summarize the key points from this YouTube video: [URL]"

## Troubleshooting

### "YouTube requires sign-in" Error

Your server IP is likely blocked. Configure a residential proxy (see Proxy Configuration above).

### Empty or No Captions

The video may not have captions available. Check if:
- The video has auto-generated or manual captions on YouTube
- The video is public and not age-restricted
- The video is available in your region

### Timeout Errors

Long videos may take time to process. The plugin logs progress—check your Strapi logs for details.

### Debug Logging

The plugin logs detailed information during transcript fetching:

```
[yt-transcript] Fetching video ABC123 via proxy: http://user:****@proxy.example.com:8080
[yt-transcript] Video ABC123 - Title: Example Video
[yt-transcript] Video ABC123 - Playability: OK
[yt-transcript] Video ABC123 - Caption tracks found: 2
[yt-transcript] Video ABC123 - Available languages: en, en (auto)
[yt-transcript] Video ABC123 - Success! 150 segments, 4532 chars
```

## Requirements

- Strapi v5.x
- Node.js >= 18

## Optional Dependencies

- `strapi-oauth-mcp-manager` - For OAuth 2.0 support (required for ChatGPT)

## License

MIT
