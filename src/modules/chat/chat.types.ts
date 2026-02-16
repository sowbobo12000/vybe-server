import { MessageType } from '../../generated/prisma';

export interface ConversationSummary {
  id: string;
  listing: {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    price: number;
  };
  otherUser: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  lastMessage: {
    content: string;
    type: MessageType;
    senderId: string;
    createdAt: Date;
  } | null;
  unreadCount: number;
  lastMessageAt: Date | null;
}

export interface SendMessageInput {
  content: string;
  type?: MessageType;
}

export interface MessageWithSender {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  readAt: Date | null;
  createdAt: Date;
  sender: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}
