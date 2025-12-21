export default {
  default: {
    openAIApiKey: '',
    model: 'gpt-4o-mini',
    temp: 0.7,
    maxTokens: 4096,
    proxyUrl: '', // Optional: HTTP/HTTPS proxy for YouTube requests (e.g., 'http://user:pass@proxy.example.com:8080')
  },
  validator(config: {
    openAIApiKey?: string;
    model?: string;
    temp?: number;
    maxTokens?: number;
    proxyUrl?: string;
  }) {
    if (config.openAIApiKey && typeof config.openAIApiKey !== 'string') {
      throw new Error('openAIApiKey must be a string');
    }
    if (config.model && typeof config.model !== 'string') {
      throw new Error('model must be a string');
    }
    if (config.temp !== undefined && (typeof config.temp !== 'number' || config.temp < 0 || config.temp > 2)) {
      throw new Error('temp must be a number between 0 and 2');
    }
    if (config.maxTokens !== undefined && (typeof config.maxTokens !== 'number' || config.maxTokens < 1)) {
      throw new Error('maxTokens must be a positive number');
    }
    if (config.proxyUrl && typeof config.proxyUrl !== 'string') {
      throw new Error('proxyUrl must be a string');
    }
  },
};
