import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Dev stub guard: provision() in UsersService returns first user (LIMIT 1).
  // If that code path is ever used in production, throw.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Dev auth stub (UsersService.provision) must not be used in production');
  }

  // Auth is a dev stub (UsersService.provision returns LIMIT 1) — not for production use
  Logger.warn('Auth is a dev stub (UsersService.provision returns LIMIT 1)', 'Bootstrap');

  // Enable CORS with allowlist from env (CORS_ORIGIN, comma-separated).
  // Default to localhost dev origins only when NODE_ENV !== 'production'.
  const corsEnv = process.env.CORS_ORIGIN ?? process.env.CORS_ORIGINS ?? '';
  const corsOrigins = corsEnv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const defaultOrigins = process.env.NODE_ENV !== 'production'
    ? ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8080', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:8080']
    : [];
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : defaultOrigins,
    credentials: true,
  });

  // Simple request logging middleware (redact auth headers)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const logger = new Logger('Request');
    const authHeader = req.headers['authorization'];
    const safeUrl = authHeader ? req.url.replace(/\?.*$/, '') : req.url; // don't log query params on auth routes
    logger.log(`${req.method} ${safeUrl}`);
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.log(`${req.method} ${safeUrl} ${res.statusCode} - ${duration}ms`);
    });
    next();
  });

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
