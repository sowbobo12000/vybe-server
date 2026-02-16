import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { MessageType } from '../../generated/prisma';

/**
 * Socket.IO gateway for real-time chat.
 * Handles WebSocket events for messaging.
 */
export function registerChatGateway(app: FastifyInstance, io: Server): void {
  const chatService = new ChatService(app);

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;

    /**
     * Join a conversation room to receive real-time messages.
     */
    socket.on('conversation:join', async (conversationId: string) => {
      try {
        // Verify the user is part of the conversation
        const conversation = await app.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { buyerId: true, sellerId: true },
        });

        if (!conversation) {
          socket.emit('error', { message: 'Conversation not found' });
          return;
        }

        if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
          socket.emit('error', { message: 'Not authorized to join this conversation' });
          return;
        }

        socket.join(`conversation:${conversationId}`);
        socket.emit('conversation:joined', { conversationId });

        app.log.debug({ userId, conversationId }, 'User joined conversation room');
      } catch (err) {
        app.log.error({ err, userId, conversationId }, 'Error joining conversation');
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    /**
     * Leave a conversation room.
     */
    socket.on('conversation:leave', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      app.log.debug({ userId, conversationId }, 'User left conversation room');
    });

    /**
     * Send a message via WebSocket (alternative to REST API).
     */
    socket.on(
      'message:send',
      async (data: { conversationId: string; content: string; type?: MessageType }) => {
        try {
          const message = await chatService.sendMessage(
            data.conversationId,
            userId,
            data.content,
            data.type || 'TEXT',
          );

          // Acknowledge the message was sent
          socket.emit('message:sent', {
            conversationId: data.conversationId,
            message: {
              id: message.id,
              content: message.content,
              type: message.type,
              sender: message.sender,
              createdAt: message.createdAt,
            },
          });
        } catch (err) {
          const error = err as Error & { statusCode?: number };
          socket.emit('message:error', {
            conversationId: data.conversationId,
            error: error.message,
          });
        }
      },
    );

    /**
     * Mark messages as read in a conversation.
     */
    socket.on('messages:read', async (conversationId: string) => {
      try {
        await app.prisma.message.updateMany({
          where: {
            conversationId,
            senderId: { not: userId },
            readAt: null,
          },
          data: { readAt: new Date() },
        });

        // Notify the other user that messages were read
        const conversation = await app.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { buyerId: true, sellerId: true },
        });

        if (conversation) {
          const otherUserId =
            conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;

          io.to(`user:${otherUserId}`).emit('messages:read', {
            conversationId,
            readBy: userId,
            readAt: new Date(),
          });
        }
      } catch (err) {
        app.log.error({ err, userId, conversationId }, 'Error marking messages as read');
      }
    });

    /**
     * Typing indicator.
     */
    socket.on('typing:start', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('typing:start', {
        conversationId,
        userId,
      });
    });

    socket.on('typing:stop', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('typing:stop', {
        conversationId,
        userId,
      });
    });

    /**
     * User online/offline status.
     */
    socket.on('disconnect', () => {
      // Broadcast offline status to user's contacts
      app.redis.del(`user:active:${userId}`).catch(() => {});
    });
  });
}
