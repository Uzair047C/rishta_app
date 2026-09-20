import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for Flutter web app
  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Reject rather than silently drop unknown fields — a typo'd key should
      // surface as an error, not as a silently ignored update.
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Lets the nightly quota cron finish and the pg pool drain on SIGTERM.
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`Rishta API listening on :${port}`, 'Bootstrap');
}

void bootstrap();
