import { z } from 'zod';

export const conversationParamsSchema = z.object({
  id: z.string().min(1, 'Conversation ID is required'),
});

export const conversationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const messagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(2000),
  type: z.enum(['TEXT', 'IMAGE', 'OFFER', 'SYSTEM']).default('TEXT'),
});

export const createConversationSchema = z.object({
  listingId: z.string().min(1, 'Listing ID is required'),
  message: z.string().min(1).max(2000),
});

export type ConversationParams = z.infer<typeof conversationParamsSchema>;
export type ConversationsQuery = z.infer<typeof conversationsQuerySchema>;
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
