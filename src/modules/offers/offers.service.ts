import { FastifyInstance } from 'fastify';
import { OfferStatus } from '../../generated/prisma';
import { CreateOfferInput, UpdateOfferInput } from './offers.schema';
import { buildCursorPagination, buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginationParams } from '../../shared/types/common';

const offerInclude = {
  listing: {
    select: {
      id: true,
      title: true,
      price: true,
      images: {
        orderBy: { order: 'asc' as const },
        take: 1,
        select: { url: true, thumbnailUrl: true },
      },
    },
  },
  buyer: {
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
    },
  },
  seller: {
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
    },
  },
};

export class OffersService {
  constructor(private readonly app: FastifyInstance) {}

  /**
   * Create a new offer on a listing.
   */
  async createOffer(buyerId: string, input: CreateOfferInput) {
    // Verify listing exists and is active
    const listing = await this.app.prisma.listing.findUnique({
      where: { id: input.listingId },
      select: { id: true, sellerId: true, status: true, price: true },
    });

    if (!listing) {
      throw Object.assign(new Error('Listing not found'), { statusCode: 404 });
    }

    if (listing.status !== 'ACTIVE') {
      throw Object.assign(new Error('This listing is no longer available'), { statusCode: 400 });
    }

    if (listing.sellerId === buyerId) {
      throw Object.assign(new Error('You cannot make an offer on your own listing'), {
        statusCode: 400,
      });
    }

    // Check for existing pending offer from this buyer
    const existingOffer = await this.app.prisma.offer.findFirst({
      where: {
        listingId: input.listingId,
        buyerId,
        status: 'PENDING',
      },
    });

    if (existingOffer) {
      throw Object.assign(new Error('You already have a pending offer on this listing'), {
        statusCode: 409,
      });
    }

    const offer = await this.app.prisma.offer.create({
      data: {
        listingId: input.listingId,
        buyerId,
        sellerId: listing.sellerId,
        amount: input.amount,
        message: input.message,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
      },
      include: offerInclude,
    });

    // Send real-time notification to seller
    this.app.io.to(`user:${listing.sellerId}`).emit('offer:new', {
      offerId: offer.id,
      listingId: listing.id,
      amount: Number(offer.amount),
      buyerName: offer.buyer.displayName,
    });

    // Create notification
    await this.app.prisma.notification.create({
      data: {
        userId: listing.sellerId,
        type: 'NEW_OFFER',
        title: 'New Offer',
        body: `${offer.buyer.displayName || 'Someone'} made an offer of $${Number(offer.amount)} on your listing`,
        data: { offerId: offer.id, listingId: listing.id },
      },
    });

    return {
      ...offer,
      amount: Number(offer.amount),
      listing: {
        ...offer.listing,
        price: Number(offer.listing.price),
      },
    };
  }

  /**
   * Get offers sent by the current user.
   */
  async getSentOffers(userId: string, pagination: PaginationParams, status?: OfferStatus) {
    const paginationArgs = buildCursorPagination(pagination);

    const offers = await this.app.prisma.offer.findMany({
      where: {
        buyerId: userId,
        ...(status && { status }),
      },
      ...paginationArgs,
      orderBy: { createdAt: 'desc' },
      include: offerInclude,
    });

    const result = buildPaginationMeta(offers, pagination.limit ?? 20);

    return {
      items: result.items.map((offer) => ({
        ...offer,
        amount: Number(offer.amount),
        listing: {
          ...offer.listing,
          price: Number(offer.listing.price),
        },
      })),
      pagination: result.pagination,
    };
  }

  /**
   * Get offers received by the current user (as a seller).
   */
  async getReceivedOffers(userId: string, pagination: PaginationParams, status?: OfferStatus) {
    const paginationArgs = buildCursorPagination(pagination);

    const offers = await this.app.prisma.offer.findMany({
      where: {
        sellerId: userId,
        ...(status && { status }),
      },
      ...paginationArgs,
      orderBy: { createdAt: 'desc' },
      include: offerInclude,
    });

    const result = buildPaginationMeta(offers, pagination.limit ?? 20);

    return {
      items: result.items.map((offer) => ({
        ...offer,
        amount: Number(offer.amount),
        listing: {
          ...offer.listing,
          price: Number(offer.listing.price),
        },
      })),
      pagination: result.pagination,
    };
  }

  /**
   * Update an offer (accept, reject, or counter).
   */
  async updateOffer(offerId: string, userId: string, input: UpdateOfferInput) {
    const offer = await this.app.prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        listing: { select: { id: true, title: true, sellerId: true } },
        buyer: { select: { id: true, displayName: true } },
        seller: { select: { id: true, displayName: true } },
      },
    });

    if (!offer) {
      throw Object.assign(new Error('Offer not found'), { statusCode: 404 });
    }

    if (offer.status !== 'PENDING') {
      throw Object.assign(new Error('This offer is no longer pending'), { statusCode: 400 });
    }

    if (offer.sellerId !== userId) {
      throw Object.assign(new Error('Only the seller can respond to offers'), { statusCode: 403 });
    }

    // Handle counter-offer
    if (input.counterAmount !== undefined) {
      // Mark original offer as countered
      await this.app.prisma.offer.update({
        where: { id: offerId },
        data: { status: 'COUNTERED' },
      });

      // Create a new counter-offer
      const counterOffer = await this.app.prisma.offer.create({
        data: {
          listingId: offer.listingId,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
          amount: input.counterAmount,
          message: input.message,
          parentOfferId: offerId,
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
        include: offerInclude,
      });

      // Notify the buyer
      this.app.io.to(`user:${offer.buyerId}`).emit('offer:countered', {
        offerId: counterOffer.id,
        originalOfferId: offerId,
        amount: Number(counterOffer.amount),
      });

      await this.app.prisma.notification.create({
        data: {
          userId: offer.buyerId,
          type: 'OFFER_COUNTERED',
          title: 'Counter Offer',
          body: `${offer.seller.displayName || 'The seller'} countered with $${input.counterAmount}`,
          data: { offerId: counterOffer.id, listingId: offer.listingId },
        },
      });

      return {
        ...counterOffer,
        amount: Number(counterOffer.amount),
        listing: {
          ...counterOffer.listing,
          price: Number(counterOffer.listing.price),
        },
      };
    }

    // Accept or reject
    const updatedOffer = await this.app.prisma.offer.update({
      where: { id: offerId },
      data: { status: input.status },
      include: offerInclude,
    });

    // If accepted, mark the listing as reserved and reject other pending offers
    if (input.status === 'ACCEPTED') {
      await this.app.prisma.listing.update({
        where: { id: offer.listingId },
        data: { status: 'RESERVED' },
      });

      // Reject other pending offers for this listing
      await this.app.prisma.offer.updateMany({
        where: {
          listingId: offer.listingId,
          id: { not: offerId },
          status: 'PENDING',
        },
        data: { status: 'REJECTED' },
      });
    }

    // Notify the buyer
    const notificationType = input.status === 'ACCEPTED' ? 'OFFER_ACCEPTED' : 'OFFER_REJECTED';
    const notificationTitle = input.status === 'ACCEPTED' ? 'Offer Accepted' : 'Offer Rejected';
    const notificationBody =
      input.status === 'ACCEPTED'
        ? `Your offer of $${Number(offer.amount)} was accepted!`
        : `Your offer of $${Number(offer.amount)} was rejected.`;

    this.app.io.to(`user:${offer.buyerId}`).emit(`offer:${input.status.toLowerCase()}`, {
      offerId,
      listingId: offer.listingId,
    });

    await this.app.prisma.notification.create({
      data: {
        userId: offer.buyerId,
        type: notificationType,
        title: notificationTitle,
        body: notificationBody,
        data: { offerId, listingId: offer.listingId },
      },
    });

    return {
      ...updatedOffer,
      amount: Number(updatedOffer.amount),
      listing: {
        ...updatedOffer.listing,
        price: Number(updatedOffer.listing.price),
      },
    };
  }
}
