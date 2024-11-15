import type { Core } from '@strapi/strapi';
import { ChatOpenAI } from "@langchain/openai";
import { TokenTextSplitter } from "@langchain/textsplitters";
import { PromptTemplate } from "@langchain/core/prompts";

import { initializeModel } from "../utils/openai";
import fetchTranscript from '../utils/fetch-transcript';

interface YTTranscriptConfig {
  openAIApiKey: string;
  model?: string;
  temp?: number;
  maxTokens?: number;
}

async function processTextChunks(chunks: string[], model: ChatOpenAI) {
  const punctuationPrompt = PromptTemplate.fromTemplate(
    "Add proper punctuation and capitalization to the following text chunk:\n\n{chunk}"
  );
  const punctuationChain = punctuationPrompt.pipe(model);

  const processedChunks = await Promise.all(
    chunks.map(async (chunk) => {
      const result = await punctuationChain.invoke({ chunk });
      return result.content as string;
    })
  );

  return processedChunks.join(" ");
}

export async function generateModifiedTranscript (rawTranscript: string) {
  const pluginSettings = await strapi.config.get('plugin.yt-transcript') as YTTranscriptConfig;     
  
  const chatModel = await initializeModel({
    openAIApiKey: pluginSettings.openAIApiKey,
    model: pluginSettings.model ?? "gpt-4o-mini",
    temp: pluginSettings.temp ?? 0.7,
    maxTokens: pluginSettings.maxTokens ?? 1000,
  });

  const splitter = new TokenTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const transcriptChunks = await splitter.createDocuments([rawTranscript]);
  const chunkTexts = transcriptChunks.map(chunk => chunk.pageContent);
  const modifiedTranscript = await processTextChunks(chunkTexts, chatModel);

  return modifiedTranscript;
}

const service = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getTranscript(identifier: string) {
    const youtubeIdRegex = /^[a-zA-Z0-9_-]{11}$/;
    const isValid = youtubeIdRegex.test(identifier);
    if (!isValid) return { error: 'Invalid video ID', data: null };
    const transcriptData = await fetchTranscript(identifier);
    return transcriptData;
  },

  async saveTranscript(payload) {
    console.log('Saving transcript:', payload);
    return await strapi.documents('plugin::yt-transcript.transcript').create({
      data: payload,
    });
  },

  async findTranscript(videoId) {
    console.log('Finding transcript for videoId:', videoId);
    const transcriptData   = await strapi.documents('plugin::yt-transcript.transcript').findFirst({
      filters: { videoId },
    });

    console.log('Transcript found:', transcriptData?.title, 'found');

    if (!transcriptData) return null;
    return transcriptData;
  },

  async generateHumanReadableTranscript(transcript) {
    console.log('Generating human readable transcript:', transcript);
    const modifiedTranscript = await generateModifiedTranscript(transcript);
    return modifiedTranscript;
  },
});

export default service;
