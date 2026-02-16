import { FastifyInstance } from 'fastify';
import { AuthController } from './auth.controller';
import { authenticate } from '../../shared/middleware/auth.middleware';
import { rateLimiters } from '../../shared/middleware/rate-limit.middleware';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const controller = new AuthController(app);

  // Phone auth
  app.post('/phone/send-code', {
    preHandler: [rateLimiters.sms],
    handler: (req, rep) => controller.sendCode(req, rep),
  });

  app.post('/phone/verify', {
    preHandler: [rateLimiters.auth],
    handler: (req, rep) => controller.verifyCode(req, rep),
  });

  // Social auth
  app.post('/google', {
    preHandler: [rateLimiters.auth],
    handler: (req, rep) => controller.googleAuth(req, rep),
  });

  app.post('/apple', {
    preHandler: [rateLimiters.auth],
    handler: (req, rep) => controller.appleAuth(req, rep),
  });

  // Token management
  app.post('/refresh', {
    preHandler: [rateLimiters.auth],
    handler: (req, rep) => controller.refreshToken(req, rep),
  });

  app.post('/logout', {
    preHandler: [authenticate],
    handler: (req, rep) => controller.logout(req, rep),
  });
}
