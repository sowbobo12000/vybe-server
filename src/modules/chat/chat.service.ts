import { FastifyInstance } from 'fastify';
import { MessageType } from '../../generated/prisma';
import { buildCursorPagination, buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginationParams } from '../../shared/types/common';

export class ChatService {
  constructor(private readonly app: FastifyInstance) {}

  /**
   * Get all conversations for a user with the last message.
   */
  async getConversations(userId: string, pagination: PaginationParams) {
    const paginationArgs = buildCursorPagination(pagination);

    const conversations = await this.app.prisma.conversation.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      ...paginationArgs,
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            price: true,
            images: {
              orderBy: { order: 'asc' },
              take: 1,
              select: { url: true, thumbnailUrl: true },
            },
          },
        },
        buyer: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        seller: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            type: true,
            senderId: true,
            createdAt: true,
          },
        },
      },
    });

    const result = buildPaginationMeta(conversations, pagination.limit ?? 20);

    // Get unread counts from Redis or DB
    const items = await Promise.all(
      result.items.map(async (conv) => {
        const unreadCount = await this.app.prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: userId },
            readAt: null,
          },
        });

        const otherUser = conv.buyerId === userId ? conv.seller : conv.buyer;

        return {
          id: conv.id,
          listing: {
            id: conv.listing.id,
            title: conv.listing.title,
            price: Number(conv.listing.price),
            thumbnailUrl: conv.listing.images[0]?.thumbnailUrl || conv.listing.images[0]?.url || null,
          },
          otherUser,
          lastMessage: conv.messages[0] || null,
          unreadCount,
          lastMessageAt: conv.lastMessageAt,
        };
      }),
    );

    return { items, pagination: result.pagination };
  }

  /**
   * Get messages for a conversation with cursor-based pagination.
   */
  async getMessages(conversationId: string, userId: string, pagination: PaginationParams) {
    // Verify user is part of the conversation
    const conversation = await this.app.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { buyerId: true, sellerId: true },
    });

    if (!conversation) {
      throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });
    }

    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw Object.assign(new Error('You are not part of this conversation'), { statusCode: 403 });
    }

    const paginationArgs = buildCursorPagination(pagination);

    const messages = await this.app.prisma.message.findMany({
      where: { conversationId },
      ...paginationArgs,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
    });

    // Mark unread messages as read
    await this.app.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return buildPaginationMeta(messages, pagination.limit ?? 50);
  }

  /**
   * Send a message in a conversation.
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type: MessageType = 'TEXT',
  ) {
    // Verify user is part of the conversation
    const conversation = await this.app.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { buyerId: true, sellerId: true },
    });

    if (!conversation) {
      throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });
    }

    if (conversation.buyerId !== senderId && conversation.sellerId !== senderId) {
      throw Object.assign(new Error('You are not part of this conversation'), { statusCode: 403 });
    }

    const [message] = await this.app.prisma.$transaction([
      this.app.prisma.message.create({
        data: {
          conversationId,
          senderId,
          content,
          type,
        },
        include: {
          sender: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      }),
      this.app.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    // Determine recipient
    const recipientId =
      conversation.buyerId === senderId ? conversation.sellerId : conversation.buyerId;

    // Emit real-time event
    this.app.io.to(`user:${recipientId}`).emit('message:new', {
      conversationId,
      message: {
        id: message.id,
        content: message.content,
        type: message.type,
        sender: message.sender,
        createdAt: message.createdAt,
      },
    });

    // Also emit to the conversation room
    this.app.io.to(`conversation:${conversationId}`).emit('message:new', {
      conversationId,
      message: {
        id: message.id,
        content: message.content,
        type: message.type,
        sender: message.sender,
        createdAt: message.createdAt,
      },
    });

    // Create notification for recipient
    await this.app.prisma.notification.create({
      data: {
        userId: recipientId,
        type: 'NEW_MESSAGE',
        title: 'New Message',
        body: `${message.sender.displayName || 'Someone'}: ${content.substring(0, 100)}`,
        data: { conversationId, messageId: message.id },
      },
    });

    return message;
  }

  /**
   * Create a new conversation (when a buyer messages about a listing for the first time).
   */
  async createConversation(buyerId: string, listingId: string, initialMessage: string) {
    // Verify listing exists
    const listing = await this.app.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, sellerId: true, status: true },
    });

    if (!listing) {
      throw Object.assign(new Error('Listing not found'), { statusCode: 404 });
    }

    if (listing.sellerId === buyerId) {
      throw Object.assign(new Error('You cannot start a conversation on your own listing'), {
        statusCode: 400,
      });
    }

    // Check if conversation already exists
    const existing = await this.app.prisma.conversation.findUnique({
      where: {
        listingId_buyerId_sellerId: {
          listingId,
          buyerId,
          sellerId: listing.sellerId,
        },
      },
    });

    if (existing) {
      // Just send the message in the existing conversation
      const message = await this.sendMessage(existing.id, buyerId, initialMessage);
      return { conversation: existing, message };
    }

    // Create new conversation with initial message
    const conversation = await this.app.prisma.conversation.create({
      data: {
        listingId,
        buyerId,
        sellerId: listing.sellerId,
        lastMessageAt: new Date(),
        messages: {
          create: {
            senderId: buyerId,
            content: initialMessage,
            type: 'TEXT',
          },
        },
      },
      include: {
        messages: {
          include: {
            sender: {
              select: { id: true, displayName: true, avatarUrl: true },
            },
          },
        },
      },
    });

    // Increment chat count on listing
    await this.app.prisma.listing.update({
      where: { id: listingId },
      data: { chatCount: { increment: 1 } },
    });

    return { conversation, message: conversation.messages[0] };
  }
}
