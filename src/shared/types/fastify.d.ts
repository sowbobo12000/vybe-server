import { PrismaClient } from '../../generated/prisma';
import { Redis } from 'ioredis';
import { Server as SocketServer } from 'socket.io';
import { AuthenticatedUser } from './common';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    io: SocketServer;
  }

  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
