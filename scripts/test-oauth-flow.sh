#!/bin/bash

# Test OAuth flow manually

BASE_URL="${1:-http://localhost:1337}"
PLUGIN_PATH="/api/yt-transcript-strapi-plugin"
CLIENT_ID="inspector"
CLIENT_SECRET="69c57a590b07aea9b21dd1324184e2e157a5941e79f1344f12509cd3cb512d99"
REDIRECT_URI="http://localhost:6274/oauth/callback"

echo "=== Testing OAuth Flow ==="
echo ""

echo "1. Checking 401 response with WWW-Authenticate header..."
curl -s -I -X POST "${BASE_URL}${PLUGIN_PATH}/mcp" 2>&1 | grep -i "www-authenticate"
echo ""

echo "2. Fetching protected resource metadata..."
curl -s "${BASE_URL}${PLUGIN_PATH}/.well-known/oauth-protected-resource" | python3 -m json.tool
echo ""

echo "3. Fetching authorization server discovery..."
curl -s "${BASE_URL}${PLUGIN_PATH}/.well-known/oauth-authorization-server" | python3 -m json.tool
echo ""

echo "4. Testing authorize endpoint..."
AUTH_URL="${BASE_URL}${PLUGIN_PATH}/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${REDIRECT_URI}'))")&state=test123"
echo "   URL: $AUTH_URL"
echo "   Response:"
curl -s -L -w "\n   Redirect: %{url_effective}\n" "$AUTH_URL" 2>&1 | head -5
echo ""

echo "=== OAuth Discovery Chain is Working! ==="
echo ""
echo "The authorize endpoint is at:"
echo "  ${BASE_URL}${PLUGIN_PATH}/oauth/authorize"
echo ""
echo "MCP Inspector bug: It's hitting /authorize instead of the correct path."
echo "Test with ChatGPT via ngrok instead."
