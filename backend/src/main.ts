import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Enable CORS with allowlist from env (comma-separated origins)
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
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
