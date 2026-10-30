import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateConfig } from './config/validation';
import { Db } from './db/db';

// Structured logging middleware with request ID and user ID
function structuredLoggingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Validate and sanitize client-supplied x-request-id
    const clientRequestId = req.headers['x-request-id'] as string | undefined;
    const requestId = clientRequestId && /^[A-Za-z0-9-]{8,64}$/.test(clientRequestId)
      ? clientRequestId
      : uuidv4();
    const start = Date.now();
    const logger = new Logger('Request');

    // Attach requestId to request for downstream use
    (req as any).requestId = requestId;

    // Redact sensitive headers
    const sensitiveKeys = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    const safeHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!sensitiveKeys.includes(key.toLowerCase()) && value !== undefined) {
        safeHeaders[key] = Array.isArray(value) ? value.join(',') : value;
      }
    }

    // Redact sensitive query params (log path only, never full url with query string)
    const sensitiveQueryKeys = ['token', 'refreshToken', 'accessToken', 'idToken', 'password', 'code'];
    const safeQuery: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (!sensitiveQueryKeys.includes(key.toLowerCase())) {
        safeQuery[key] = Array.isArray(value) ? value.join(',') : String(value);
      }
    }

    // Redact sensitive body fields - allowlist approach: only log non-sensitive fields
    // By default, log no body fields. Callers can use a custom logger for specific fields.
    let safeBody: Record<string, unknown> = {};
    if (req.body && typeof req.body === 'object') {
      // Only log presence of body, not contents (to avoid PII leaks)
      safeBody = { _present: true, _keys: Object.keys(req.body) };
    }

    // Log request start
    logger.log(JSON.stringify({
      type: 'request_start',
      requestId,
      method: req.method,
      path: req.path,
      query: safeQuery,
      headers: safeHeaders,
      body: safeBody,
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    }));

    res.on('finish', () => {
      const duration = Date.now() - start;
      const userId = (req as any).user?.id || (req as any).userId || 'anonymous';

      logger.log(JSON.stringify({
        type: 'request_end',
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
        userId,
        ip: req.ip,
      }));
    });

    next();
  };
}

async function bootstrap(): Promise<void> {
  // Validate configuration before creating the app
  validateConfig(process.env);

  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(require('express').json({ limit: '100kb' }));

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for API
    crossOriginEmbedderPolicy: false,
  }));

  // Trust proxy for correct IP addresses behind reverse proxy (nginx, cloudflare, etc.)
  // Enable via TRUST_PROXY=true in production
  if (process.env.TRUST_PROXY === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', true);
  }

  // Enable CORS with explicit allowlist from env (CORS_ORIGINS, comma-separated).
  // No default allowlist in production - must be configured explicitly.
  const corsEnv = process.env.CORS_ORIGINS ?? '';
  const corsOrigins = corsEnv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (corsOrigins.length === 0 && process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGINS must be set in production');
  }
  const defaultOrigins = process.env.NODE_ENV !== 'production'
    ? ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8080', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:8080']
    : [];
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : defaultOrigins,
    credentials: true,
  });

  // Health and readiness endpoints (public)
  const { Router } = await import('express');
  const router = Router();
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  router.get('/ready', async (_req: Request, res: Response) => {
    try {
      const db = app.get(Db);
      await db.query('SELECT 1');
      res.json({ status: 'ready', database: 'connected' });
    } catch (err) {
      // Log server-side, don't expose error details
      console.error('Readiness check failed:', err);
      res.status(503).json({ status: 'not ready', database: 'disconnected' });
    }
  });
  app.use('/', router);

  // Structured request logging middleware
  app.use(structuredLoggingMiddleware());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`Rishta API listening on :${port}`, 'Bootstrap');
}

void bootstrap();
