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

    // Get proxy config if available
    const pluginSettings = (await strapi.config.get(
      'plugin::yt-transcript-strapi-plugin'
    )) as YTTranscriptConfig | undefined;

    const transcriptData = await fetchTranscript(identifier, {
      proxyUrl: pluginSettings?.proxyUrl,
    });

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
