import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AppModule } from './app.module';

// Structured logging middleware with request ID and user ID
function structuredLoggingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    const start = Date.now();
    const logger = new Logger('Request');

    // Attach requestId to request for downstream use
    (req as any).requestId = requestId;

    // Redact sensitive headers and query params
    const sensitiveKeys = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    const safeHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!sensitiveKeys.includes(key.toLowerCase()) && value !== undefined) {
        safeHeaders[key] = Array.isArray(value) ? value.join(',') : value;
      }
    }

    // Redact sensitive query params
    const sensitiveQueryKeys = ['token', 'refreshToken', 'accessToken', 'idToken', 'password', 'code'];
    const safeQuery: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (!sensitiveQueryKeys.includes(key.toLowerCase())) {
        safeQuery[key] = Array.isArray(value) ? value.join(',') : String(value);
      }
    }

    // Redact sensitive body fields
    let safeBody = req.body;
    if (req.body && typeof req.body === 'object') {
      safeBody = { ...req.body };
      const sensitiveBodyKeys = ['token', 'refreshToken', 'accessToken', 'idToken', 'password', 'email', 'phone', 'lat', 'lng', 'location'];
      for (const key of sensitiveBodyKeys) {
        if (safeBody[key] !== undefined) {
          safeBody[key] = '[REDACTED]';
        }
      }
    }

    // Log request start
    logger.log(JSON.stringify({
      type: 'request_start',
      requestId,
      method: req.method,
      url: req.url,
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
        url: req.url,
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
  const app = await NestFactory.create(AppModule);

  // Dev stub guard: provision() in UsersService returns first user (LIMIT 1).
  // If that code path is ever used in production, throw.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Dev auth stub (UsersService.provision) must not be used in production');
  }

  // Auth is a dev stub (UsersService.provision returns LIMIT 1) — not for production use
  Logger.warn('Auth is a dev stub (UsersService.provision returns LIMIT 1)', 'Bootstrap');

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
