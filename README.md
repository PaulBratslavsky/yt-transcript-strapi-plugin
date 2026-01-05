# YouTube Transcript Strapi Plugin

A Strapi plugin that provides YouTube transcript extraction with **MCP (Model Context Protocol)** support for AI assistants like ChatGPT and Claude.

## Features

- Extract transcripts from YouTube videos
- MCP server endpoint for AI assistant integration
- OAuth 2.0 authentication support (for ChatGPT)
- API token authentication support (for Claude Desktop)
- Automatic transcript chunking and search
- Works with `strapi-oauth-mcp-manager` for centralized OAuth

## Installation

```bash
npm install yt-transcript-strapi-plugin
```

## Configuration

Add the plugin to your `config/plugins.ts`:

```typescript
export default () => ({
  'yt-transcript-strapi-plugin': {
    enabled: true,
    config: {
      proxyUrl: process.env.PROXY_URL,           // Optional: proxy for YouTube requests
      chunkSizeSeconds: 300,                      // Chunk size for pagination (5 minutes)
      previewLength: 500,                         // Preview length in characters
      maxFullTranscriptLength: 50000,             // Auto-load full transcript if under this
      searchSegmentSeconds: 30,                   // Segment size for search
    },
  },
});
```

## MCP Endpoint

The plugin exposes an MCP endpoint at:

```
/api/yt-transcript-strapi-plugin/mcp
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `get_transcript_preview` | Get video metadata and transcript preview |
| `get_transcript_chunk` | Get a specific chunk of the transcript |
| `search_transcript` | Search within a transcript |
| `get_full_transcript` | Get the complete transcript |

## Authentication

### Option 1: OAuth 2.0 (ChatGPT)

For ChatGPT integration, use with `strapi-oauth-mcp-manager`:

1. Install and enable `strapi-oauth-mcp-manager` plugin
2. Create an OAuth client in Strapi admin
3. Configure ChatGPT with:
   - MCP Server URL: `https://your-domain/api/yt-transcript-strapi-plugin/mcp`
   - OAuth Client ID and Secret from Strapi admin

The plugin automatically registers with the OAuth manager on startup.

### Option 2: API Token (Claude Desktop)

For Claude Desktop, use direct API token authentication:

```json
{
  "mcpServers": {
    "yt-transcript": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-server.com/api/yt-transcript-strapi-plugin/mcp",
        "--header",
        "Authorization: Bearer YOUR_STRAPI_API_TOKEN"
      ]
    }
  }
}
```

Get your API token from: Strapi Admin > Settings > API Tokens

## Usage with AI Assistants

Once connected, you can ask your AI assistant:

- "Get the transcript from this YouTube video: [URL]"
- "Search for mentions of 'machine learning' in this video"
- "Summarize the main points from this YouTube video"

## Requirements

- Strapi v5.x
- Node.js >= 18

## Optional Dependencies

- `strapi-oauth-mcp-manager` - For OAuth 2.0 support (required for ChatGPT)

## License

MIT
