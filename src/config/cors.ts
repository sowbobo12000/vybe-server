import { FastifyCorsOptions } from '@fastify/cors';
import { config } from './index';

export const corsConfig: FastifyCorsOptions = {
  origin: config.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Total-Count', 'X-Request-ID'],
  maxAge: 86400,
};
