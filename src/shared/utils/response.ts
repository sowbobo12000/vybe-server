import { FastifyReply } from 'fastify';
import { ApiResponse, ApiError, PaginationMeta } from '../types/common';

/**
 * Send a successful response with data.
 */
export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  statusCode: number = 200,
  pagination?: PaginationMeta,
): void {
  const response: ApiResponse<T> = { data };
  if (pagination) {
    response.pagination = pagination;
  }
  reply.status(statusCode).send(response);
}

/**
 * Send a created response (201).
 */
export function sendCreated<T>(reply: FastifyReply, data: T): void {
  sendSuccess(reply, data, 201);
}

/**
 * Send a no content response (204).
 */
export function sendNoContent(reply: FastifyReply): void {
  reply.status(204).send();
}

/**
 * Send an error response.
 */
export function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const response: ApiError = {
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
  };
  reply.status(statusCode).send(response);
}

/**
 * Common error responses.
 */
export const errors = {
  badRequest: (reply: FastifyReply, message: string = 'Bad request', details?: unknown) =>
    sendError(reply, 400, 'BAD_REQUEST', message, details),

  unauthorized: (reply: FastifyReply, message: string = 'Unauthorized') =>
    sendError(reply, 401, 'UNAUTHORIZED', message),

  forbidden: (reply: FastifyReply, message: string = 'Forbidden') =>
    sendError(reply, 403, 'FORBIDDEN', message),

  notFound: (reply: FastifyReply, resource: string = 'Resource') =>
    sendError(reply, 404, 'NOT_FOUND', `${resource} not found`),

  conflict: (reply: FastifyReply, message: string = 'Resource already exists') =>
    sendError(reply, 409, 'CONFLICT', message),

  tooManyRequests: (reply: FastifyReply, message: string = 'Too many requests') =>
    sendError(reply, 429, 'TOO_MANY_REQUESTS', message),

  internal: (reply: FastifyReply, message: string = 'Internal server error') =>
    sendError(reply, 500, 'INTERNAL_ERROR', message),
};
