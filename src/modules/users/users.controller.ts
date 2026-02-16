import { FastifyRequest, FastifyReply } from 'fastify';
import { UsersService } from './users.service';
import {
  getUserParamsSchema,
  updateProfileSchema,
  userListingsQuerySchema,
  userReviewsQuerySchema,
} from './users.schema';
import { sendSuccess, errors } from '../../shared/utils/response';
import { ListingStatus } from '../../generated/prisma';

export class UsersController {
  private service: UsersService;

  constructor(private readonly app: import('fastify').FastifyInstance) {
    this.service = new UsersService(app);
  }

  /**
   * GET /users/:id
   * Get a user's public profile.
   */
  async getUser(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = getUserParamsSchema.parse(request.params);
    const user = await this.service.getUserById(id);

    if (!user) {
      return errors.notFound(reply, 'User');
    }

    sendSuccess(reply, user);
  }

  /**
   * PATCH /users/me
   * Update the authenticated user's profile.
   */
  async updateMe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return errors.unauthorized(reply);
    }

    const data = updateProfileSchema.parse(request.body);

    try {
      const user = await this.service.updateProfile(request.user.userId, data);
      sendSuccess(reply, user);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 409) {
        return errors.conflict(reply, error.message);
      }
      throw err;
    }
  }

  /**
   * GET /users/:id/listings
   * Get a user's listings.
   */
  async getUserListings(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = getUserParamsSchema.parse(request.params);
    const query = userListingsQuerySchema.parse(request.query);

    const result = await this.service.getUserListings(
      id,
      { cursor: query.cursor, limit: query.limit },
      query.status as ListingStatus | undefined,
    );

    sendSuccess(reply, result.items, 200, result.pagination);
  }

  /**
   * GET /users/:id/reviews
   * Get reviews for a user.
   */
  async getUserReviews(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = getUserParamsSchema.parse(request.params);
    const query = userReviewsQuerySchema.parse(request.query);

    const result = await this.service.getUserReviews(id, {
      cursor: query.cursor,
      limit: query.limit,
    });

    sendSuccess(reply, result.items, 200, result.pagination);
  }
}
