import { FastifyInstance } from 'fastify';
import { Prisma, ListingStatus } from '../../generated/prisma';
import { UserProfile, UserProfileUpdate } from './users.types';
import { buildCursorPagination, buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginationParams } from '../../shared/types/common';

export class UsersService {
  constructor(private readonly app: FastifyInstance) {}

  /**
   * Get a user's public profile by ID.
   */
  async getUserById(userId: string): Promise<UserProfile | null> {
    const user = await this.app.prisma.user.findUnique({
      where: { id: userId, isActive: true },
      select: {
        id: true,
        displayName: true,
        username: true,
        avatarUrl: true,
        bio: true,
        neighborhood: true,
        city: true,
        state: true,
        mannerTemp: true,
        verifiedBadges: true,
        createdAt: true,
        _count: {
          select: {
            listings: { where: { status: 'ACTIVE' } },
            reviewsReceived: true,
          },
        },
      },
    });

    if (!user) return null;

    // Get average rating
    const ratingResult = await this.app.prisma.review.aggregate({
      where: { revieweeId: userId },
      _avg: { rating: true },
    });

    return {
      id: user.id,
      displayName: user.displayName,
      username: user.username,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      neighborhood: user.neighborhood,
      city: user.city,
      state: user.state,
      mannerTemp: user.mannerTemp,
      verifiedBadges: user.verifiedBadges,
      createdAt: user.createdAt,
      listingCount: user._count.listings,
      reviewCount: user._count.reviewsReceived,
      averageRating: ratingResult._avg.rating ?? undefined,
    };
  }

  /**
   * Update the current user's profile.
   */
  async updateProfile(userId: string, data: UserProfileUpdate): Promise<UserProfile> {
    // Check username uniqueness if being updated
    if (data.username) {
      const existingUser = await this.app.prisma.user.findFirst({
        where: {
          username: data.username,
          id: { not: userId },
        },
      });

      if (existingUser) {
        throw Object.assign(new Error('Username is already taken'), { statusCode: 409 });
      }
    }

    const user = await this.app.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: data.displayName,
        username: data.username,
        bio: data.bio,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        avatarUrl: data.avatarUrl,
      },
      select: {
        id: true,
        displayName: true,
        username: true,
        avatarUrl: true,
        bio: true,
        neighborhood: true,
        city: true,
        state: true,
        mannerTemp: true,
        verifiedBadges: true,
        createdAt: true,
      },
    });

    // Invalidate user profile cache
    await this.app.redis.del(`user:profile:${userId}`);

    return user;
  }

  /**
   * Get a user's listings with cursor-based pagination.
   */
  async getUserListings(
    userId: string,
    pagination: PaginationParams,
    status?: ListingStatus,
  ) {
    const paginationArgs = buildCursorPagination(pagination);

    const where: Prisma.ListingWhereInput = {
      sellerId: userId,
      ...(status ? { status } : { status: { not: 'DELETED' } }),
    };

    const listings = await this.app.prisma.listing.findMany({
      where,
      ...paginationArgs,
      orderBy: { createdAt: 'desc' },
      include: {
        images: {
          orderBy: { order: 'asc' },
          take: 1,
        },
      },
    });

    return buildPaginationMeta(listings, pagination.limit ?? 20);
  }

  /**
   * Get reviews for a user with cursor-based pagination.
   */
  async getUserReviews(userId: string, pagination: PaginationParams) {
    const paginationArgs = buildCursorPagination(pagination);

    const reviews = await this.app.prisma.review.findMany({
      where: { revieweeId: userId },
      ...paginationArgs,
      orderBy: { createdAt: 'desc' },
      include: {
        reviewer: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarUrl: true,
          },
        },
        listing: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    return buildPaginationMeta(reviews, pagination.limit ?? 20);
  }
}
