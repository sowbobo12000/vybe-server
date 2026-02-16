import { FastifyInstance } from 'fastify';
import { UsersController } from './users.controller';
import { authenticate } from '../../shared/middleware/auth.middleware';

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  const controller = new UsersController(app);

  // Update current user's profile (must come before /:id to avoid conflict)
  app.patch('/me', {
    preHandler: [authenticate],
    handler: (req, rep) => controller.updateMe(req, rep),
  });

  // Get user profile
  app.get('/:id', {
    handler: (req, rep) => controller.getUser(req, rep),
  });

  // Get user's listings
  app.get('/:id/listings', {
    handler: (req, rep) => controller.getUserListings(req, rep),
  });

  // Get user's reviews
  app.get('/:id/reviews', {
    handler: (req, rep) => controller.getUserReviews(req, rep),
  });
}
