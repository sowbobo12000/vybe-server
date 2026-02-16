import { FastifyInstance } from 'fastify';
import { ListingsController } from './listings.controller';
import { authenticate, optionalAuth } from '../../shared/middleware/auth.middleware';
import { rateLimiters } from '../../shared/middleware/rate-limit.middleware';

export async function listingsRoutes(app: FastifyInstance): Promise<void> {
  const controller = new ListingsController(app);

  // Public endpoints
  app.get('/', {
    handler: (req, rep) => controller.getListings(req, rep),
  });

  app.get('/:id', {
    preHandler: [optionalAuth],
    handler: (req, rep) => controller.getListing(req, rep),
  });

  // Protected endpoints
  app.post('/', {
    preHandler: [authenticate],
    handler: (req, rep) => controller.createListing(req, rep),
  });

  app.patch('/:id', {
    preHandler: [authenticate],
    handler: (req, rep) => controller.updateListing(req, rep),
  });

  app.delete('/:id', {
    preHandler: [authenticate],
    handler: (req, rep) => controller.deleteListing(req, rep),
  });

  app.post('/:id/images', {
    preHandler: [authenticate, rateLimiters.upload],
    handler: (req, rep) => controller.uploadImages(req, rep),
  });
}
