import type { Core } from '@strapi/strapi';
import fetchTranscript from '../utils/fetch-transcript';

interface YTTranscriptConfig {
  proxyUrl?: string;
}

const service = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getTranscript(identifier: string) {
    const youtubeIdRegex = /^[a-zA-Z0-9_-]{11}$/;
    const isValid = youtubeIdRegex.test(identifier);
    if (!isValid) {
      return { error: 'Invalid video ID', data: null };
    }

    // Get proxy config - try multiple methods to find it
    const pluginConfigFromGet = strapi.config.get('plugin::yt-transcript-strapi-plugin') as any;
    const pluginInstance = strapi.plugin('yt-transcript-strapi-plugin');
    const configFromPlugin = pluginInstance?.config;

    // Debug: log what we're getting
    strapi.log.info(`[yt-transcript] Config from strapi.config.get: ${JSON.stringify(pluginConfigFromGet)}`);
    strapi.log.info(`[yt-transcript] Config from plugin.config: ${typeof configFromPlugin === 'function' ? 'function' : JSON.stringify(configFromPlugin)}`);

    // Try to get proxyUrl from various places
    let proxyUrl: string | undefined;

    // Method 1: Direct from plugin config function (Strapi v5 way)
    if (typeof configFromPlugin === 'function') {
      proxyUrl = configFromPlugin('proxyUrl');
      strapi.log.info(`[yt-transcript] proxyUrl from config function: ${proxyUrl ? 'SET' : 'NOT SET'}`);
    }

    // Method 2: From strapi.config.get (might be nested under .config)
    if (!proxyUrl && pluginConfigFromGet) {
      proxyUrl = pluginConfigFromGet.proxyUrl || pluginConfigFromGet.config?.proxyUrl;
    }

    // Log at service level using strapi logger
    if (proxyUrl) {
      const maskedUrl = proxyUrl.replace(/:([^@:]+)@/, ':****@');
      strapi.log.info(`[yt-transcript] Fetching transcript for ${identifier} via proxy: ${maskedUrl}`);
    } else {
      strapi.log.info(`[yt-transcript] Fetching transcript for ${identifier} (NO PROXY - check config)`);
    }

    const transcriptData = await fetchTranscript(identifier, {
      proxyUrl,
    });

    strapi.log.info(`[yt-transcript] Successfully fetched transcript for ${identifier}`);

    return {
      title: transcriptData.title,
      fullTranscript: transcriptData.fullTranscript,
      transcriptWithTimeCodes: transcriptData.transcriptWithTimeCodes,
    };
  },

  async saveTranscript(payload: Record<string, unknown>) {
    return await strapi.documents('plugin::yt-transcript-strapi-plugin.transcript').create({
      data: payload,
    });
  },

  async findTranscript(videoId: string) {
    const transcriptData = await strapi.documents('plugin::yt-transcript-strapi-plugin.transcript').findFirst({
      filters: { videoId },
    });

    if (!transcriptData) return null;
    return transcriptData;
  },
});

export default service;
