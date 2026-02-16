import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { config } from '../../config';

/**
 * Fastify plugin that initializes and decorates the Redis client.
 * Handles connection lifecycle, reconnection, and graceful shutdown.
 */
async function redisPlugin(fastify: FastifyInstance): Promise<void> {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      fastify.log.warn({ attempt: times, delay }, 'Redis reconnecting...');
      return delay;
    },
    reconnectOnError(err) {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some((e) => err.message.includes(e));
    },
    enableReadyCheck: true,
    lazyConnect: false,
  });

  redis.on('connect', () => {
    fastify.log.info('Redis connected');
  });

  redis.on('error', (err) => {
    fastify.log.error({ err }, 'Redis connection error');
  });

  redis.on('close', () => {
    fastify.log.warn('Redis connection closed');
  });

  // Wait for Redis to be ready
  await new Promise<void>((resolve, reject) => {
    if (redis.status === 'ready') {
      resolve();
      return;
    }
    redis.once('ready', resolve);
    redis.once('error', reject);
  });

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    fastify.log.info('Disconnecting Redis...');
    await redis.quit();
  });
}

export default fp(redisPlugin, {
  name: 'redis',
});
