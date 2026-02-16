import { FastifyRequest, FastifyReply } from 'fastify';
import { errors } from '../utils/response';

interface RateLimitOptions {
  /** Maximum number of requests within the window */
  max: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Key prefix for Redis (defaults to 'rl') */
  prefix?: string;
  /** Custom key generator (defaults to IP-based) */
  keyGenerator?: (request: FastifyRequest) => string;
}

/**
 * Create a Redis-based rate limiter middleware.
 * Uses a sliding window algorithm with Redis MULTI/EXEC.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const { max, windowSeconds, prefix = 'rl', keyGenerator } = options;

  return async function rateLimitHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const redis = request.server.redis;

    const identifier = keyGenerator
      ? keyGenerator(request)
      : request.ip;

    const key = `${prefix}:${request.routeOptions.url}:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    try {
      // Use a pipeline for atomicity
      const pipeline = redis.pipeline();

      // Remove expired entries
      pipeline.zremrangebyscore(key, 0, windowStart);

      // Count current entries
      pipeline.zcard(key);

      // Add current request
      pipeline.zadd(key, now, `${now}:${Math.random()}`);

      // Set TTL
      pipeline.expire(key, windowSeconds);

      const results = await pipeline.exec();

      // results[1] is the zcard result: [error, count]
      const currentCount = (results?.[1]?.[1] as number) || 0;

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', max);
      reply.header('X-RateLimit-Remaining', Math.max(0, max - currentCount - 1));
      reply.header('X-RateLimit-Reset', Math.ceil((now + windowSeconds * 1000) / 1000));

      if (currentCount >= max) {
        reply.header('Retry-After', windowSeconds);
        return errors.tooManyRequests(reply, 'Rate limit exceeded. Please try again later.');
      }
    } catch (err) {
      // If Redis is down, allow the request through (fail open)
      request.log.error({ err }, 'Rate limiter Redis error, failing open');
    }
  };
}

/**
 * Pre-configured rate limiters for common use cases.
 */
export const rateLimiters = {
  /** Standard API rate limit: 100 requests per minute */
  standard: createRateLimiter({ max: 100, windowSeconds: 60 }),

  /** Strict rate limit for auth endpoints: 10 requests per minute */
  auth: createRateLimiter({ max: 10, windowSeconds: 60, prefix: 'rl:auth' }),

  /** Very strict rate limit for SMS sending: 3 requests per 5 minutes */
  sms: createRateLimiter({ max: 3, windowSeconds: 300, prefix: 'rl:sms' }),

  /** Upload rate limit: 20 uploads per minute */
  upload: createRateLimiter({ max: 20, windowSeconds: 60, prefix: 'rl:upload' }),
};
