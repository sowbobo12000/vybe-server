import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  API_PREFIX: z.string().default('/api/v1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_EXPIRATION: z.string().default('30d'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // AWS S3
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),
  S3_BUCKET_NAME: z.string().default('vybe-marketplace-images'),
  S3_PRESIGNED_URL_EXPIRATION: z.coerce.number().default(3600),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_SERVICE_SID: z.string().default(''),

  // Google
  GOOGLE_CLIENT_ID: z.string().default(''),

  // Apple
  APPLE_CLIENT_ID: z.string().default(''),
  APPLE_TEAM_ID: z.string().default(''),
  APPLE_KEY_ID: z.string().default(''),

  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.format();
    const messages: string[] = [];
    for (const [key, val] of Object.entries(formatted)) {
      if (key === '_errors') continue;
      const errors = (val as { _errors: string[] })._errors;
      if (errors?.length) {
        messages.push(`  ${key}: ${errors.join(', ')}`);
      }
    }
    throw new Error(`Environment validation failed:\n${messages.join('\n')}`);
  }

  return parsed.data;
}

export const config = loadConfig();
