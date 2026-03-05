/**
 * AI Tools Service -- Adapter for AI SDK Discovery
 *
 * Imports canonical tool definitions from src/tools/ and exposes them
 * via getTools() for the AI SDK discovery loop to register into its ToolRegistry.
 */

import type { Core } from '@strapi/strapi';
import { tools } from '../tools';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  getTools() {
    return tools;
  },
});
