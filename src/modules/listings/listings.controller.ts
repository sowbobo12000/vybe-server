import { FastifyRequest, FastifyReply } from 'fastify';
import { ListingsService } from './listings.service';
import {
  listingParamsSchema,
  listingsQuerySchema,
  createListingSchema,
  updateListingSchema,
  presignedUrlSchema,
} from './listings.schema';
import { sendSuccess, sendCreated, sendNoContent, errors } from '../../shared/utils/response';

export class ListingsController {
  private service: ListingsService;

  constructor(private readonly app: import('fastify').FastifyInstance) {
    this.service = new ListingsService(app);
  }

  /**
   * GET /listings
   * Get listings with filters and pagination.
   */
  async getListings(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = listingsQuerySchema.parse(request.query);
    const result = await this.service.getListings(query);
    sendSuccess(reply, result.items, 200, result.pagination);
  }

  /**
   * GET /listings/:id
   * Get a single listing by ID.
   */
  async getListing(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = listingParamsSchema.parse(request.params);
    const listing = await this.service.getListingById(id, request.user?.userId);

    if (!listing) {
      return errors.notFound(reply, 'Listing');
    }

    sendSuccess(reply, listing);
  }

  /**
   * POST /listings
   * Create a new listing.
   */
  async createListing(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return errors.unauthorized(reply);
    }

    const data = createListingSchema.parse(request.body);
    const listing = await this.service.createListing(request.user.userId, data);
    sendCreated(reply, listing);
  }

  /**
   * PATCH /listings/:id
   * Update a listing.
   */
  async updateListing(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return errors.unauthorized(reply);
    }

    const { id } = listingParamsSchema.parse(request.params);
    const data = updateListingSchema.parse(request.body);

    try {
      const listing = await this.service.updateListing(id, request.user.userId, data);
      sendSuccess(reply, listing);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 404) return errors.notFound(reply, 'Listing');
      if (error.statusCode === 403) return errors.forbidden(reply, error.message);
      if (error.statusCode === 400) return errors.badRequest(reply, error.message);
      throw err;
    }
  }

  /**
   * DELETE /listings/:id
   * Soft-delete a listing.
   */
  async deleteListing(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return errors.unauthorized(reply);
    }

    const { id } = listingParamsSchema.parse(request.params);

    try {
      await this.service.deleteListing(id, request.user.userId);
      sendNoContent(reply);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 404) return errors.notFound(reply, 'Listing');
      if (error.statusCode === 403) return errors.forbidden(reply, error.message);
      throw err;
    }
  }

  /**
   * POST /listings/:id/images
   * Generate presigned URLs for image upload.
   */
  async uploadImages(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return errors.unauthorized(reply);
    }

    const { id } = listingParamsSchema.parse(request.params);
    const { contentType, count } = presignedUrlSchema.parse(request.body);

    try {
      const urls = await this.service.generateImageUploadUrls(
        id,
        request.user.userId,
        contentType,
        count,
      );
      sendCreated(reply, urls);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 404) return errors.notFound(reply, 'Listing');
      if (error.statusCode === 403) return errors.forbidden(reply, error.message);
      if (error.statusCode === 400) return errors.badRequest(reply, error.message);
      throw err;
    }
  }
}
