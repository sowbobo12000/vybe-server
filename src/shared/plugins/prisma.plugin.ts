import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '../../generated/prisma';

/**
 * Fastify plugin that initializes and decorates the Prisma client.
 * Handles connection lifecycle and graceful shutdown.
 */
async function prismaPlugin(fastify: FastifyInstance): Promise<void> {
  const prisma = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'info' },
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ]
        : [
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ],
  });

  // Log slow queries in development
  if (process.env.NODE_ENV === 'development') {
    prisma.$on('query', (e) => {
      if (e.duration > 100) {
        fastify.log.warn(
          { query: e.query, duration: e.duration },
          'Slow database query detected',
        );
      }
    });
  }

  await prisma.$connect();
  fastify.log.info('Prisma connected to database');

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async () => {
    fastify.log.info('Disconnecting Prisma...');
    await prisma.$disconnect();
  });
}

export default fp(prismaPlugin, {
  name: 'prisma',
});
