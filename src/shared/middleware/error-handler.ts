import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { Prisma } from '../../generated/prisma';
import { ApiError } from '../types/common';

/**
 * Global error handler for Fastify.
 * Handles Zod validation errors, Prisma errors, and generic errors.
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  request.log.error({ err: error }, 'Request error');

  // Zod validation errors
  if (error instanceof ZodError) {
    const response: ApiError = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      },
    };
    reply.status(400).send(response);
    return;
  }

  // Prisma known request errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        // Unique constraint violation
        const target = (error.meta?.target as string[]) || [];
        const response: ApiError = {
          error: {
            code: 'CONFLICT',
            message: `A record with this ${target.join(', ')} already exists`,
            details: { fields: target },
          },
        };
        reply.status(409).send(response);
        return;
      }
      case 'P2025': {
        // Record not found
        const response: ApiError = {
          error: {
            code: 'NOT_FOUND',
            message: 'The requested resource was not found',
          },
        };
        reply.status(404).send(response);
        return;
      }
      case 'P2003': {
        // Foreign key constraint
        const response: ApiError = {
          error: {
            code: 'BAD_REQUEST',
            message: 'Referenced resource does not exist',
          },
        };
        reply.status(400).send(response);
        return;
      }
      default: {
        request.log.error({ prismaCode: error.code, meta: error.meta }, 'Unhandled Prisma error');
      }
    }
  }

  // Prisma validation errors
  if (error instanceof Prisma.PrismaClientValidationError) {
    const response: ApiError = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Database validation failed',
      },
    };
    reply.status(400).send(response);
    return;
  }

  // Fastify schema validation errors
  if (error.validation) {
    const response: ApiError = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation,
      },
    };
    reply.status(400).send(response);
    return;
  }

  // JWT errors
  if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER' || error.code === 'FST_JWT_BAD_REQUEST') {
    const response: ApiError = {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    };
    reply.status(401).send(response);
    return;
  }

  // Rate limit errors
  if (error.statusCode === 429) {
    const response: ApiError = {
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: error.message || 'Rate limit exceeded',
      },
    };
    reply.status(429).send(response);
    return;
  }

  // Default server error
  const statusCode = error.statusCode || 500;
  const response: ApiError = {
    error: {
      code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR',
      message:
        statusCode >= 500 && process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : error.message,
    },
  };

  reply.status(statusCode).send(response);
}
