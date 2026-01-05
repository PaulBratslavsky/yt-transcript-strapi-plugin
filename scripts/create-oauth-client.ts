import { randomBytes } from 'crypto';

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN;

if (!STRAPI_API_TOKEN) {
  console.error('Error: STRAPI_API_TOKEN environment variable is required');
  console.error('Usage: STRAPI_API_TOKEN=your-token npx ts-node scripts/create-oauth-client.ts');
  process.exit(1);
}

async function createOAuthClient() {
  const clientId = 'chatgpt';
  const clientSecret = randomBytes(32).toString('hex');

  const oauthClient = {
    clientId,
    clientSecret,
    name: 'ChatGPT MCP',
    redirectUris: ['https://chatgpt.com/aip/g/callback'],
    strapiApiToken: STRAPI_API_TOKEN,
    active: true,
  };

  console.log('Creating OAuth client...\n');

  try {
    const response = await fetch(
      `${STRAPI_URL}/api/yt-transcript-strapi-plugin/oauth-clients`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${STRAPI_API_TOKEN}`,
        },
        body: JSON.stringify({ data: oauthClient }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create OAuth client: ${response.status} ${error}`);
    }

    const result = await response.json();

    console.log('✅ OAuth Client created successfully!\n');
    console.log('='.repeat(60));
    console.log('Save these credentials (clientSecret is shown only once):');
    console.log('='.repeat(60));
    console.log(`Client ID:     ${clientId}`);
    console.log(`Client Secret: ${clientSecret}`);
    console.log('='.repeat(60));
    console.log('\nChatGPT Configuration URLs:');
    console.log('='.repeat(60));

    const ngrokUrl = process.env.NGROK_URL || STRAPI_URL;
    console.log(`MCP Server URL:      ${ngrokUrl}/api/yt-transcript-strapi-plugin/mcp`);
    console.log(`Authorization URL:   ${ngrokUrl}/api/yt-transcript-strapi-plugin/oauth/authorize`);
    console.log(`Token URL:           ${ngrokUrl}/api/yt-transcript-strapi-plugin/oauth/token`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createOAuthClient();
