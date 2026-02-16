import { z } from 'zod';

const listingConditions = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR'] as const;
const listingCategories = [
  'ELECTRONICS', 'FURNITURE', 'CLOTHING', 'BOOKS', 'SPORTS',
  'TOYS', 'HOME', 'AUTO', 'GARDEN', 'MUSIC', 'ART',
  'COLLECTIBLES', 'FREE_STUFF', 'OTHER',
] as const;
const listingStatuses = ['ACTIVE', 'RESERVED', 'SOLD', 'HIDDEN', 'DELETED'] as const;

export const listingParamsSchema = z.object({
  id: z.string().min(1, 'Listing ID is required'),
});

export const listingsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  category: z.enum(listingCategories).optional(),
  condition: z.enum(listingConditions).optional(),
  price_min: z.coerce.number().min(0).optional(),
  price_max: z.coerce.number().min(0).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().min(0.1).max(100).default(10).optional(),
  search: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  is_free: z.coerce.boolean().optional(),
});

export const createListingSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  price: z.number().min(0).max(999999.99),
  isFree: z.boolean().default(false),
  isNegotiable: z.boolean().default(true),
  condition: z.enum(listingConditions),
  category: z.enum(listingCategories),
  neighborhood: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const updateListingSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(5000).optional(),
  price: z.number().min(0).max(999999.99).optional(),
  isFree: z.boolean().optional(),
  isNegotiable: z.boolean().optional(),
  condition: z.enum(listingConditions).optional(),
  category: z.enum(listingCategories).optional(),
  neighborhood: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  status: z.enum(listingStatuses).optional(),
});

export const presignedUrlSchema = z.object({
  contentType: z
    .string()
    .regex(/^image\/(jpeg|png|webp|gif)$/, 'Only JPEG, PNG, WebP, and GIF images are allowed'),
  count: z.number().int().min(1).max(10).default(1),
});

export type ListingParams = z.infer<typeof listingParamsSchema>;
export type ListingsQuery = z.infer<typeof listingsQuerySchema>;
export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
export type PresignedUrlInput = z.infer<typeof presignedUrlSchema>;
