import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import formbody from '@fastify/formbody';
import rateLimit from '@fastify/rate-limit';

import { config } from './config';
import { getLoggerConfig } from './config/logger';
import { corsConfig } from './config/cors';
import { errorHandler } from './shared/middleware/error-handler';

import prismaPlugin from './shared/plugins/prisma.plugin';
import redisPlugin from './shared/plugins/redis.plugin';
import socketPlugin from './shared/plugins/socket.plugin';

import { authRoutes } from './modules/auth/auth.routes';
import { usersRoutes } from './modules/users/users.routes';
import { listingsRoutes } from './modules/listings/listings.routes';
import { offersRoutes } from './modules/offers/offers.routes';
import { registerChatGateway } from './modules/chat/chat.gateway';

export async function buildApp() {
  const app = Fastify({
    logger: getLoggerConfig(),
    trustProxy: true,
  });

  // Global error handler
  app.setErrorHandler(errorHandler);

  // Core plugins
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, corsConfig);
  await app.register(formbody);
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
  });

  // Infrastructure plugins
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(socketPlugin);

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // API routes
  await app.register(authRoutes, { prefix: `${config.API_PREFIX}/auth` });
  await app.register(usersRoutes, { prefix: `${config.API_PREFIX}/users` });
  await app.register(listingsRoutes, { prefix: `${config.API_PREFIX}/listings` });
  await app.register(offersRoutes, { prefix: `${config.API_PREFIX}/offers` });

  // WebSocket chat gateway
  registerChatGateway(app, app.io);

  return app;
}
