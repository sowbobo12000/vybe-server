import { OfferStatus } from '../../generated/prisma';

export interface CreateOfferInput {
  listingId: string;
  amount: number;
  message?: string;
}

export interface UpdateOfferInput {
  status: 'ACCEPTED' | 'REJECTED';
  counterAmount?: number;
  message?: string;
}

export interface OfferWithDetails {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  message: string | null;
  status: OfferStatus;
  parentOfferId: string | null;
  createdAt: Date;
  updatedAt: Date;
  listing: {
    id: string;
    title: string;
    price: number;
    images: { url: string; thumbnailUrl: string | null }[];
  };
  buyer: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  seller: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}
