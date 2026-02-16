import { FastifyInstance } from 'fastify';
import { OffersController } from './offers.controller';
import { authenticate } from '../../shared/middleware/auth.middleware';

export async function offersRoutes(app: FastifyInstance): Promise<void> {
  const controller = new OffersController(app);

  // All offer routes require authentication
  app.addHook('preHandler', authenticate);

  app.post('/', (req, rep) => controller.createOffer(req, rep));
  app.get('/sent', (req, rep) => controller.getSentOffers(req, rep));
  app.get('/received', (req, rep) => controller.getReceivedOffers(req, rep));
  app.patch('/:id', (req, rep) => controller.updateOffer(req, rep));
}
