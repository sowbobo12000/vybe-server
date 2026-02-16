import { z } from 'zod';

export const getUserParamsSchema = z.object({
  id: z.string().min(1, 'User ID is required'),
});

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9\s\-_.]+$/, 'Display name contains invalid characters')
    .optional(),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .optional(),
  bio: z.string().max(500).optional(),
  neighborhood: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  avatarUrl: z.string().url().optional(),
});

export const userListingsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['ACTIVE', 'RESERVED', 'SOLD']).optional(),
});

export const userReviewsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export type GetUserParams = z.infer<typeof getUserParamsSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UserListingsQuery = z.infer<typeof userListingsQuerySchema>;
export type UserReviewsQuery = z.infer<typeof userReviewsQuerySchema>;
