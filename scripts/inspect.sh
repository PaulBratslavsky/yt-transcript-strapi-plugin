#!/bin/bash

# MCP Inspector script - kills existing processes and starts fresh

# Default URL
URL="${1:-http://localhost:1337/api/yt-transcript-strapi-plugin/mcp}"

echo "Cleaning up existing inspector processes..."
pkill -f "mcp.*inspector" 2>/dev/null
lsof -ti:6274,6277 2>/dev/null | xargs kill -9 2>/dev/null
sleep 1

echo ""
echo "Starting MCP Inspector..."
echo "URL: $URL"
echo ""
echo "OAuth Client Credentials:"
echo "  Client ID: inspector"
echo "  Client Secret: 69c57a590b07aea9b21dd1324184e2e157a5941e79f1344f12509cd3cb512d99"
echo ""

npx @modelcontextprotocol/inspector "$URL"
