import { FastifyInstance } from 'fastify';
import { Prisma } from '../../generated/prisma';
import { CreateListingInput, UpdateListingInput, ListingsQuery } from './listings.schema';
import { buildCursorPagination, buildPaginationMeta } from '../../shared/utils/pagination';
import { generatePresignedUploadUrl, PresignedUrlResult } from '../../shared/utils/s3';

export class ListingsService {
  constructor(private readonly app: FastifyInstance) {}

  /**
   * Get listings with filters and cursor-based pagination.
   */
  async getListings(query: ListingsQuery) {
    const paginationArgs = buildCursorPagination({
      cursor: query.cursor,
      limit: query.limit,
    });

    const where: Prisma.ListingWhereInput = {
      status: 'ACTIVE',
    };

    // Apply filters
    if (query.category) where.category = query.category;
    if (query.condition) where.condition = query.condition;
    if (query.city) where.city = query.city;
    if (query.state) where.state = query.state;
    if (query.is_free !== undefined) where.isFree = query.is_free;

    // Price range filter
    if (query.price_min !== undefined || query.price_max !== undefined) {
      where.price = {};
      if (query.price_min !== undefined) where.price.gte = query.price_min;
      if (query.price_max !== undefined) where.price.lte = query.price_max;
    }

    // Text search (simple ILIKE for now, could use full-text search)
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Geolocation filter (Haversine approximation using bounding box + precise distance)
    if (query.lat !== undefined && query.lng !== undefined && query.radius) {
      const radiusKm = query.radius;
      // Rough bounding box (1 degree lat ~ 111km)
      const latDelta = radiusKm / 111;
      const lngDelta = radiusKm / (111 * Math.cos((query.lat * Math.PI) / 180));

      where.latitude = {
        gte: query.lat - latDelta,
        lte: query.lat + latDelta,
      };
      where.longitude = {
        gte: query.lng - lngDelta,
        lte: query.lng + lngDelta,
      };
    }

    const listings = await this.app.prisma.listing.findMany({
      where,
      ...paginationArgs,
      orderBy: { createdAt: 'desc' },
      include: {
        images: {
          orderBy: { order: 'asc' },
          take: 1,
          select: { thumbnailUrl: true, url: true },
        },
        seller: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // If using geolocation, filter by exact distance
    let filteredListings = listings;
    if (query.lat !== undefined && query.lng !== undefined && query.radius) {
      filteredListings = listings.filter((listing) => {
        if (!listing.latitude || !listing.longitude) return false;
        const distance = haversineDistance(
          query.lat!,
          query.lng!,
          listing.latitude,
          listing.longitude,
        );
        return distance <= query.radius!;
      });
    }

    const result = buildPaginationMeta(filteredListings, query.limit);

    // Transform to include thumbnail
    const items = result.items.map((listing) => ({
      id: listing.id,
      title: listing.title,
      price: Number(listing.price),
      isFree: listing.isFree,
      condition: listing.condition,
      category: listing.category,
      city: listing.city,
      state: listing.state,
      thumbnailUrl: listing.images[0]?.thumbnailUrl || listing.images[0]?.url || null,
      likeCount: listing.likeCount,
      chatCount: listing.chatCount,
      createdAt: listing.createdAt,
      seller: listing.seller,
    }));

    return { items, pagination: result.pagination };
  }

  /**
   * Get a single listing by ID with full details.
   */
  async getListingById(listingId: string, viewerUserId?: string) {
    const listing = await this.app.prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        images: { orderBy: { order: 'asc' } },
        seller: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarUrl: true,
            mannerTemp: true,
            verifiedBadges: true,
            createdAt: true,
          },
        },
        _count: {
          select: { offers: true, conversations: true },
        },
      },
    });

    if (!listing || listing.status === 'DELETED') return null;

    // Increment view count asynchronously
    this.app.prisma.listing.update({
      where: { id: listingId },
      data: { viewCount: { increment: 1 } },
    }).catch(() => {});

    // Check if the viewer has liked this listing
    let isLiked = false;
    if (viewerUserId) {
      const like = await this.app.prisma.like.findUnique({
        where: {
          userId_listingId: {
            userId: viewerUserId,
            listingId,
          },
        },
      });
      isLiked = !!like;
    }

    return {
      ...listing,
      price: Number(listing.price),
      isLiked,
    };
  }

  /**
   * Create a new listing.
   */
  async createListing(sellerId: string, input: CreateListingInput) {
    const listing = await this.app.prisma.listing.create({
      data: {
        sellerId,
        title: input.title,
        description: input.description,
        price: input.price,
        isFree: input.isFree,
        isNegotiable: input.isNegotiable,
        condition: input.condition,
        category: input.category,
        neighborhood: input.neighborhood,
        city: input.city,
        state: input.state,
        latitude: input.latitude,
        longitude: input.longitude,
      },
      include: {
        images: true,
        seller: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return {
      ...listing,
      price: Number(listing.price),
    };
  }

  /**
   * Update a listing. Only the seller can update their listing.
   */
  async updateListing(listingId: string, sellerId: string, input: UpdateListingInput) {
    // Verify ownership
    const listing = await this.app.prisma.listing.findUnique({
      where: { id: listingId },
      select: { sellerId: true, status: true },
    });

    if (!listing) {
      throw Object.assign(new Error('Listing not found'), { statusCode: 404 });
    }

    if (listing.sellerId !== sellerId) {
      throw Object.assign(new Error('You can only update your own listings'), { statusCode: 403 });
    }

    if (listing.status === 'DELETED') {
      throw Object.assign(new Error('Cannot update a deleted listing'), { statusCode: 400 });
    }

    const updated = await this.app.prisma.listing.update({
      where: { id: listingId },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.price !== undefined && { price: input.price }),
        ...(input.isFree !== undefined && { isFree: input.isFree }),
        ...(input.isNegotiable !== undefined && { isNegotiable: input.isNegotiable }),
        ...(input.condition !== undefined && { condition: input.condition }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.neighborhood !== undefined && { neighborhood: input.neighborhood }),
        ...(input.city !== undefined && { city: input.city }),
        ...(input.state !== undefined && { state: input.state }),
        ...(input.latitude !== undefined && { latitude: input.latitude }),
        ...(input.longitude !== undefined && { longitude: input.longitude }),
        ...(input.status !== undefined && { status: input.status }),
      },
      include: {
        images: { orderBy: { order: 'asc' } },
        seller: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Invalidate cached listing
    await this.app.redis.del(`listing:${listingId}`);

    return {
      ...updated,
      price: Number(updated.price),
    };
  }

  /**
   * Soft-delete a listing.
   */
  async deleteListing(listingId: string, sellerId: string): Promise<void> {
    const listing = await this.app.prisma.listing.findUnique({
      where: { id: listingId },
      select: { sellerId: true },
    });

    if (!listing) {
      throw Object.assign(new Error('Listing not found'), { statusCode: 404 });
    }

    if (listing.sellerId !== sellerId) {
      throw Object.assign(new Error('You can only delete your own listings'), { statusCode: 403 });
    }

    await this.app.prisma.listing.update({
      where: { id: listingId },
      data: { status: 'DELETED' },
    });

    // Cancel all pending offers for this listing
    await this.app.prisma.offer.updateMany({
      where: { listingId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    await this.app.redis.del(`listing:${listingId}`);
  }

  /**
   * Generate presigned URLs for image upload.
   */
  async generateImageUploadUrls(
    listingId: string,
    sellerId: string,
    contentType: string,
    count: number,
  ): Promise<PresignedUrlResult[]> {
    // Verify ownership
    const listing = await this.app.prisma.listing.findUnique({
      where: { id: listingId },
      select: { sellerId: true },
    });

    if (!listing) {
      throw Object.assign(new Error('Listing not found'), { statusCode: 404 });
    }

    if (listing.sellerId !== sellerId) {
      throw Object.assign(new Error('You can only upload images to your own listings'), {
        statusCode: 403,
      });
    }

    // Check existing image count
    const existingCount = await this.app.prisma.listingImage.count({
      where: { listingId },
    });

    if (existingCount + count > 10) {
      throw Object.assign(new Error('Maximum 10 images per listing'), { statusCode: 400 });
    }

    const urls: PresignedUrlResult[] = [];
    for (let i = 0; i < count; i++) {
      const result = await generatePresignedUploadUrl(
        `listings/${listingId}`,
        contentType,
        sellerId,
      );
      urls.push(result);

      // Create the image record (will be confirmed when upload completes)
      await this.app.prisma.listingImage.create({
        data: {
          listingId,
          url: result.fileUrl,
          order: existingCount + i,
        },
      });
    }

    return urls;
  }
}

/**
 * Calculate the distance between two points using the Haversine formula.
 * Returns distance in kilometers.
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
