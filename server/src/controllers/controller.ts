import type { Core } from '@strapi/strapi';
import { extractYouTubeID } from '../utils/extract-youtube-id';
const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getTranscript(ctx) {
    const videoId = extractYouTubeID(ctx.params.videoId);

    if (!videoId) return (ctx.body = { error: 'Invalid YouTube URL or ID', data: null });

    console.log("Looking for transcript in database");

    const found = await strapi
      .plugin('yt-transcript-strapi-plugin')
      .service('service')
      .findTranscript(videoId);

    if (found) {
      console.log("Transcript found.");
      return (ctx.body = { data: found });
    }

    console.log("Transcript not found. Fetching new transcript.");

    const transcriptData = await strapi
      .plugin('yt-transcript-strapi-plugin')
      .service('service')
      .getTranscript(videoId);

    console.log("New transcript fetched.");

    const readableTranscript = await strapi
      .plugin('yt-transcript-strapi-plugin')
      .service('service')
      .generateHumanReadableTranscript(transcriptData.fullTranscript);

    console.log("Human readable transcript generated.");

    const payload = {
      videoId,
      title: transcriptData?.title || "No title found",
      fullTranscript: transcriptData?.fullTranscript,
      transcriptWithTimeCodes: transcriptData?.transcriptWithTimeCodes,
      readableTranscript: readableTranscript,
    };

    console.log("Payload:", payload);

    console.log("Saving new transcript to database.");

    const transcript = await strapi
      .plugin('yt-transcript-strapi-plugin')
      .service('service')
      .saveTranscript(payload);

    ctx.body = { data: transcript };
  },
});

export default controller;
