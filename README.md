# YT TRANSCRIPT STRAPI PLUGIN

Here is a basic strapi plugin that allows you to get the transcript of a youtube video and save it to the database.

## Installation

```bash
  npm install yt-transcript-strapi-plugin
```

## Update Configuration

In your Strapi project directory, go to the `config/plugins.ts` file and add the following:

```ts
  export default () => ({
  "yt-transcript-strapi-plugin": {
    enabled: true,
    resolve: "./src/plugins/yt-transcript-strapi-plugin",
    config: {
      openAIApiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4o-mini",
      temp: 0.7,
      maxTokens: 1000,
    },
  },
});

```

You will need to add the `OPENAI_API_KEY` to your `.env` file and provide the other parameters as needed.

- model: can be any model that is supported by OpenAI
- temp: temperature of the model
- maxTokens: max tokens for the model
