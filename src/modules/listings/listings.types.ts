import { ListingStatus, ListingCondition, ListingCategory } from '../../generated/prisma';

export interface ListingFilters {
  category?: ListingCategory;
  condition?: ListingCondition;
  priceMin?: number;
  priceMax?: number;
  lat?: number;
  lng?: number;
  radius?: number; // in km
  search?: string;
  city?: string;
  state?: string;
  isFree?: boolean;
}

export interface CreateListingInput {
  title: string;
  description: string;
  price: number;
  isFree?: boolean;
  isNegotiable?: boolean;
  condition: ListingCondition;
  category: ListingCategory;
  neighborhood?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
}

export interface UpdateListingInput {
  title?: string;
  description?: string;
  price?: number;
  isFree?: boolean;
  isNegotiable?: boolean;
  condition?: ListingCondition;
  category?: ListingCategory;
  neighborhood?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  status?: ListingStatus;
}

export interface ListingSummary {
  id: string;
  title: string;
  price: number;
  isFree: boolean;
  condition: ListingCondition;
  category: ListingCategory;
  city: string | null;
  state: string | null;
  thumbnailUrl: string | null;
  likeCount: number;
  chatCount: number;
  createdAt: Date;
  seller: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface PresignedUrlRequest {
  contentType: string;
  count?: number;
}
