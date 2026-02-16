import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../utils/jwt';
import { errors } from '../utils/response';

/**
 * Middleware to verify JWT access token and attach user to request.
 * Use as a preHandler hook on protected routes.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errors.unauthorized(reply, 'Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);

    // Verify session is still valid in Redis
    const sessionKey = `session:${payload.sessionId}`;
    const sessionExists = await request.server.redis.exists(sessionKey);

    if (!sessionExists) {
      // Fall back to checking the database if not in Redis
      const session = await request.server.prisma.userSession.findUnique({
        where: { id: payload.sessionId },
      });

      if (!session || session.expiresAt < new Date()) {
        return errors.unauthorized(reply, 'Session expired');
      }

      // Re-cache the session in Redis
      const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
      if (ttl > 0) {
        await request.server.redis.set(sessionKey, session.userId, 'EX', ttl);
      }
    }

    request.user = {
      userId: payload.userId,
      sessionId: payload.sessionId,
    };
  } catch {
    return errors.unauthorized(reply, 'Invalid or expired token');
  }
}

/**
 * Optional authentication - attaches user if token is present but does not require it.
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    request.user = {
      userId: payload.userId,
      sessionId: payload.sessionId,
    };
  } catch {
    // Token is invalid but that's ok for optional auth
  }
}
