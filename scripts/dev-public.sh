#!/bin/bash

# Start ngrok and display the public URL with all necessary endpoints

echo "Starting ngrok tunnel to localhost:1337..."
echo ""

# Start ngrok in background and capture output
ngrok http 1337 --log=stdout > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!

# Wait for ngrok to start
sleep 3

# Get the public URL from ngrok API
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$NGROK_URL" ]; then
    echo "Error: Could not get ngrok URL. Make sure ngrok is installed."
    kill $NGROK_PID 2>/dev/null
    exit 1
fi

echo "=============================================="
echo "  ngrok tunnel is running!"
echo "=============================================="
echo ""
echo "Public URL: $NGROK_URL"
echo ""
echo "----------------------------------------------"
echo "ChatGPT Configuration:"
echo "----------------------------------------------"
echo ""
echo "MCP Server URL:"
echo "  $NGROK_URL/api/yt-transcript-strapi-plugin/mcp"
echo ""
echo "OAuth Discovery:"
echo "  $NGROK_URL/api/yt-transcript-strapi-plugin/.well-known/oauth-authorization-server"
echo ""
echo "----------------------------------------------"
echo "Create OAuth Client (run this curl):"
echo "----------------------------------------------"
echo ""
echo "curl -X POST '$NGROK_URL/api/yt-transcript-strapi-plugin/oauth-clients' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"clientId\":\"chatgpt\",\"name\":\"ChatGPT\",\"redirectUris\":[\"https://chatgpt.com/aip/g/callback\"],\"strapiApiToken\":\"YOUR_STRAPI_API_TOKEN\"}'"
echo ""
echo "----------------------------------------------"
echo "Press Ctrl+C to stop ngrok"
echo "----------------------------------------------"

# Wait for user to stop
wait $NGROK_PID
