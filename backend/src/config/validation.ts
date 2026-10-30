import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export const appConfigSchema = Joi.object({
  // Database
  DATABASE_URL: Joi.string().uri().required().messages({
    'string.uri': 'DATABASE_URL must be a valid PostgreSQL connection string',
    'any.required': 'DATABASE_URL is required',
  }),
  DATABASE_SSL: Joi.string().valid('true', 'false').default('false'),
  DATABASE_SSL_CA: Joi.string().allow('').optional(),
  DATABASE_SSL_INSECURE: Joi.string().valid('true', 'false').default('false'),
  DB_POOL_MAX: Joi.number().integer().min(1).max(100).default(10),

  // JWT
  JWT_SECRET: Joi.string().min(32).required().messages({
    'string.min': 'JWT_SECRET must be at least 32 characters',
    'any.required': 'JWT_SECRET is required',
  }),
  JWT_ACCESS_TTL_MINUTES: Joi.number().integer().min(1).max(1440).default(15),
  JWT_REFRESH_TTL_DAYS: Joi.number().integer().min(1).max(365).default(30),
  JWT_ISSUER: Joi.string().default('rishta-api'),
  JWT_AUDIENCE: Joi.string().default('rishta-app'),

  // Firebase
  FIREBASE_PROJECT_ID: Joi.string().required().messages({
    'any.required': 'FIREBASE_PROJECT_ID is required',
  }),
  FIREBASE_CLIENT_EMAIL: Joi.string().email().required().messages({
    'any.required': 'FIREBASE_CLIENT_EMAIL is required',
  }),
  FIREBASE_PRIVATE_KEY: Joi.string().required().messages({
    'any.required': 'FIREBASE_PRIVATE_KEY is required',
  }),

  // Stream Chat
  STREAM_API_KEY: Joi.string().required().messages({
    'any.required': 'STREAM_API_KEY is required',
  }),
  STREAM_API_SECRET: Joi.string().required().messages({
    'any.required': 'STREAM_API_SECRET is required',
  }),

  // RevenueCat
  REVENUECAT_WEBHOOK_SECRET: Joi.string().required().messages({
    'any.required': 'REVENUECAT_WEBHOOK_SECRET is required',
  }),

  // CORS
  CORS_ORIGINS: Joi.string().required().messages({
    'any.required': 'CORS_ORIGINS is required (comma-separated list)',
  }),

  // Admin
  ADMIN_TOKEN: Joi.string().optional(), // deprecated, prefer ADMIN_USER_IDS
  ADMIN_USER_IDS: Joi.string().allow('').optional(), // comma-separated UUIDs

  // Redis (for throttling)
  REDIS_URL: Joi.string().uri().optional(),

  // Storage
  STORAGE_BUCKET_HOST: Joi.string().optional(),
  STORAGE_BUCKET_NAME: Joi.string().optional(),

  // App
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  TRUST_PROXY: Joi.string().valid('true', 'false').default('false'),

  // Rate limits
  THROTTLE_DEFAULT_LIMIT: Joi.number().integer().min(1).default(100),
  THROTTLE_DEFAULT_TTL: Joi.number().integer().min(1000).default(60000),
}).unknown(true);

export const validateConfig = (config: Record<string, unknown>) => {
  const { error, value } = appConfigSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
  });
  if (error) {
    const messages = error.details.map((d) => d.message).join('; ');
    throw new Error(`Configuration validation failed: ${messages}`);
  }
  return value;
};

export default registerAs('app', () => validateConfig(process.env));