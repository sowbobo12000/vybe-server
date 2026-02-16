import { FastifyRequest, FastifyReply } from 'fastify';
import { ChatService } from './chat.service';
import {
  conversationParamsSchema,
  conversationsQuerySchema,
  messagesQuerySchema,
  sendMessageSchema,
  createConversationSchema,
} from './chat.schema';
import { sendSuccess, sendCreated, errors } from '../../shared/utils/response';
import { MessageType } from '../../generated/prisma';

export class ChatController {
  private service: ChatService;

  constructor(private readonly app: import('fastify').FastifyInstance) {
    this.service = new ChatService(app);
  }

  /**
   * GET /conversations
   * Get all conversations for the current user.
   */
  async getConversations(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return errors.unauthorized(reply);
    }

    const query = conversationsQuerySchema.parse(request.query);
    const result = await this.service.getConversations(request.user.userId, {
      cursor: query.cursor,
      limit: query.limit,
    });

    sendSuccess(reply, result.items, 200, result.pagination);
  }

  /**
   * GET /conversations/:id/messages
   * Get messages in a conversation.
   */
  async getMessages(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return errors.unauthorized(reply);
    }

    const { id } = conversationParamsSchema.parse(request.params);
    const query = messagesQuerySchema.parse(request.query);

    try {
      const result = await this.service.getMessages(id, request.user.userId, {
        cursor: query.cursor,
        limit: query.limit,
      });
      sendSuccess(reply, result.items, 200, result.pagination);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 404) return errors.notFound(reply, 'Conversation');
      if (error.statusCode === 403) return errors.forbidden(reply, error.message);
      throw err;
    }
  }

  /**
   * POST /conversations/:id/messages
   * Send a message in a conversation.
   */
  async sendMessage(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return errors.unauthorized(reply);
    }

    const { id } = conversationParamsSchema.parse(request.params);
    const { content, type } = sendMessageSchema.parse(request.body);

    try {
      const message = await this.service.sendMessage(
        id,
        request.user.userId,
        content,
        type as MessageType,
      );
      sendCreated(reply, message);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 404) return errors.notFound(reply, 'Conversation');
      if (error.statusCode === 403) return errors.forbidden(reply, error.message);
      throw err;
    }
  }

  /**
   * POST /conversations
   * Start a new conversation about a listing.
   */
  async createConversation(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return errors.unauthorized(reply);
    }

    const { listingId, message } = createConversationSchema.parse(request.body);

    try {
      const result = await this.service.createConversation(
        request.user.userId,
        listingId,
        message,
      );
      sendCreated(reply, result);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 404) return errors.notFound(reply, 'Listing');
      if (error.statusCode === 400) return errors.badRequest(reply, error.message);
      throw err;
    }
  }
}
