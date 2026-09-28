import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { createOriginProtectionMiddleware, parseCorsOrigins } from './config/security';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const corsOrigins = parseCorsOrigins(config.getOrThrow<string>('CORS_ORIGIN'));
  const apiHost =
    config.get<string>('API_HOST') ??
    (config.get<string>('NODE_ENV') === 'production' ? '127.0.0.1' : undefined);

  app.set('trust proxy', 'loopback');
  app.use('/whatsapp/webhook/kirago', json({ limit: '32kb' }));
  app.use(
    '/payment-webhooks',
    json({
      limit: '64kb',
      verify: (req, _res, buffer) => {
        (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use('/legacy-import/payments/preview', json({ limit: '8mb' }));
  app.use('/legacy-import/payments/import', json({ limit: '2mb' }));
  app.use('/legacy-import/cutover/activate', json({ limit: '16kb' }));
  app.use(json({ limit: '1mb' }));
  app.use(helmet());
  app.use(cookieParser());
  app.use(createOriginProtectionMiddleware(corsOrigins));
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (apiHost) {
    await app.listen(config.get<number>('PORT', 3001), apiHost);
    return;
  }

  await app.listen(config.get<number>('PORT', 3001));
}

void bootstrap();
