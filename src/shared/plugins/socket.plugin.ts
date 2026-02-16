import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { config } from '../../config';
import { verifyAccessToken } from '../utils/jwt';

/**
 * Fastify plugin that initializes Socket.IO server.
 * Handles authentication, connection lifecycle, and graceful shutdown.
 */
async function socketPlugin(fastify: FastifyInstance): Promise<void> {
  const io = new Server(fastify.server, {
    cors: {
      origin: config.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.slice(7);

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = verifyAccessToken(token);

      // Verify session exists
      const sessionExists = await fastify.redis.exists(`session:${payload.sessionId}`);
      if (!sessionExists) {
        const session = await fastify.prisma.userSession.findUnique({
          where: { id: payload.sessionId },
        });
        if (!session || session.expiresAt < new Date()) {
          return next(new Error('Session expired'));
        }
      }

      // Attach user data to socket
      socket.data.userId = payload.userId;
      socket.data.sessionId = payload.sessionId;

      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    fastify.log.info({ userId, socketId: socket.id }, 'Socket connected');

    // Join user's personal room for targeted messages
    socket.join(`user:${userId}`);

    // Update last active timestamp
    fastify.redis.set(`user:active:${userId}`, Date.now().toString(), 'EX', 300).catch(() => {});

    socket.on('disconnect', (reason) => {
      fastify.log.info({ userId, socketId: socket.id, reason }, 'Socket disconnected');
    });

    socket.on('error', (err) => {
      fastify.log.error({ err, userId, socketId: socket.id }, 'Socket error');
    });
  });

  fastify.decorate('io', io);

  fastify.addHook('onClose', async () => {
    fastify.log.info('Closing Socket.IO...');
    io.close();
  });
}

export default fp(socketPlugin, {
  name: 'socket',
  dependencies: ['redis', 'prisma'],
});
