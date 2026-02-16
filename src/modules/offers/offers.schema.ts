import { z } from 'zod';

export const offerParamsSchema = z.object({
  id: z.string().min(1, 'Offer ID is required'),
});

export const offersQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'CANCELLED', 'EXPIRED']).optional(),
});

export const createOfferSchema = z.object({
  listingId: z.string().min(1, 'Listing ID is required'),
  amount: z.number().min(0).max(999999.99),
  message: z.string().max(500).optional(),
});

export const updateOfferSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED']),
  counterAmount: z.number().min(0).max(999999.99).optional(),
  message: z.string().max(500).optional(),
});

export type OfferParams = z.infer<typeof offerParamsSchema>;
export type OffersQuery = z.infer<typeof offersQuerySchema>;
export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;
