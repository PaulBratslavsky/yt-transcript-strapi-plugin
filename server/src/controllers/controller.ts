import type { Core } from '@strapi/strapi';
import { extractYouTubeID } from '../utils/extract-youtube-id';
const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getTranscript(ctx) {
    const videoId = extractYouTubeID(ctx.params.videoId);

    if (!videoId) return (ctx.body = { error: 'Invalid YouTube URL or ID', data: null });

    const found = await strapi
      .plugin('yt-transcript')
      .service('service')
      .findTranscript(videoId);

    if (found) return (ctx.body = { data: found });

    const transcriptData = await strapi
      .plugin('yt-transcript')
      .service('service')
      .getTranscript(videoId);

    const readableTranscript = await strapi
      .plugin('yt-transcript')
      .service('service')
      .generateHumanReadableTranscript(transcriptData.fullTranscript);

    const payload = {
      title: transcriptData.title,
      transcript: transcriptData.transcript,
      videoId: transcriptData.videoId,
      thumbnailUrl: transcriptData.thumbnailUrl,
      fullTranscript: transcriptData.fullTranscript,
      transcriptWithTimeCodes: transcriptData.transcriptWithTimeCodes,
      readableTranscript: readableTranscript,
    };

    console.log('Payload:', payload);

    const transcript = await strapi
      .plugin('yt-transcript')
      .service('service')
      .saveTranscript(payload);

    ctx.body = { data: transcript };
  },
});

export default controller;
