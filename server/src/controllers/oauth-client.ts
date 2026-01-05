import type { Core } from '@strapi/strapi';
import { randomBytes } from 'node:crypto';

const PLUGIN_ID = 'plugin::yt-transcript-strapi-plugin';

const oauthClientController = ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Create a new OAuth client
   * POST /oauth-clients
   */
  async create(ctx: any) {
    const { clientId, name, redirectUris, strapiApiToken } = ctx.request.body;

    if (!clientId || !name || !redirectUris || !strapiApiToken) {
      ctx.status = 400;
      ctx.body = {
        error: 'Missing required fields',
        required: ['clientId', 'name', 'redirectUris', 'strapiApiToken'],
      };
      return;
    }

    // Generate client secret
    const clientSecret = randomBytes(32).toString('hex');

    try {
      const client = await strapi.documents(`${PLUGIN_ID}.oauth-client`).create({
        data: {
          clientId,
          clientSecret,
          name,
          redirectUris,
          strapiApiToken,
          active: true,
        } as any,
      });

      ctx.body = {
        message: 'OAuth client created successfully',
        clientId,
        clientSecret, // Only shown once!
        name,
        redirectUris,
      };
    } catch (error: any) {
      if (error.message?.includes('unique')) {
        ctx.status = 409;
        ctx.body = { error: 'Client ID already exists' };
      } else {
        throw error;
      }
    }
  },

  /**
   * List OAuth clients (without secrets)
   * GET /oauth-clients
   */
  async find(ctx: any) {
    const clients = await strapi.documents(`${PLUGIN_ID}.oauth-client`).findMany({
      filters: { active: true },
    });

    ctx.body = clients.map((c: any) => ({
      id: c.documentId,
      clientId: c.clientId,
      name: c.name,
      redirectUris: c.redirectUris,
      active: c.active,
      createdAt: c.createdAt,
    }));
  },

  /**
   * Update an OAuth client
   * PUT /oauth-clients/:id
   */
  async update(ctx: any) {
    const { id } = ctx.params;
    const { name, redirectUris, active } = ctx.request.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (redirectUris !== undefined) updateData.redirectUris = redirectUris;
    if (active !== undefined) updateData.active = active;

    const client = await strapi.documents(`${PLUGIN_ID}.oauth-client`).update({
      documentId: id,
      data: updateData,
    });

    ctx.body = {
      message: 'OAuth client updated',
      client: {
        id: client?.documentId,
        clientId: client?.clientId,
        name: client?.name,
        redirectUris: client?.redirectUris,
        active: client?.active,
      },
    };
  },

  /**
   * Delete an OAuth client
   * DELETE /oauth-clients/:id
   */
  async delete(ctx: any) {
    const { id } = ctx.params;

    await strapi.documents(`${PLUGIN_ID}.oauth-client`).delete({
      documentId: id,
    });

    ctx.body = { message: 'OAuth client deleted' };
  },
});

export default oauthClientController;
