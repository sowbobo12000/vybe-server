import { FastifyRequest, FastifyReply } from 'fastify';
import { OffersService } from './offers.service';
import {
  offerParamsSchema,
  offersQuerySchema,
  createOfferSchema,
  updateOfferSchema,
} from './offers.schema';
import { sendSuccess, sendCreated, errors } from '../../shared/utils/response';
import { OfferStatus } from '../../generated/prisma';

export class OffersController {
  private service: OffersService;

  constructor(private readonly app: import('fastify').FastifyInstance) {
    this.service = new OffersService(app);
  }

  /**
   * POST /offers
   * Create a new offer on a listing.
   */
  async createOffer(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return errors.unauthorized(reply);
    }

    const data = createOfferSchema.parse(request.body);

    try {
      const offer = await this.service.createOffer(request.user.userId, data);
      sendCreated(reply, offer);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 404) return errors.notFound(reply, 'Listing');
      if (error.statusCode === 400) return errors.badRequest(reply, error.message);
      if (error.statusCode === 409) return errors.conflict(reply, error.message);
      throw err;
    }
  }

  /**
   * GET /offers/sent
   * Get offers sent by the current user.
   */
  async getSentOffers(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return errors.unauthorized(reply);
    }

    const query = offersQuerySchema.parse(request.query);
    const result = await this.service.getSentOffers(
      request.user.userId,
      { cursor: query.cursor, limit: query.limit },
      query.status as OfferStatus | undefined,
    );

    sendSuccess(reply, result.items, 200, result.pagination);
  }

  /**
   * GET /offers/received
   * Get offers received by the current user.
   */
  async getReceivedOffers(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return errors.unauthorized(reply);
    }

    const query = offersQuerySchema.parse(request.query);
    const result = await this.service.getReceivedOffers(
      request.user.userId,
      { cursor: query.cursor, limit: query.limit },
      query.status as OfferStatus | undefined,
    );

    sendSuccess(reply, result.items, 200, result.pagination);
  }

  /**
   * PATCH /offers/:id
   * Update an offer (accept, reject, or counter).
   */
  async updateOffer(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return errors.unauthorized(reply);
    }

    const { id } = offerParamsSchema.parse(request.params);
    const data = updateOfferSchema.parse(request.body);

    try {
      const offer = await this.service.updateOffer(id, request.user.userId, data);
      sendSuccess(reply, offer);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 404) return errors.notFound(reply, 'Offer');
      if (error.statusCode === 400) return errors.badRequest(reply, error.message);
      if (error.statusCode === 403) return errors.forbidden(reply, error.message);
      throw err;
    }
  }
}
