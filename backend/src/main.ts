import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnvFile } from './config/load-env';
import { APP_CONFIG, AppConfig } from './config/configuration';
import { setupSwagger } from './swagger';

export const API_PREFIX = 'api/v1';

async function bootstrap(): Promise<void> {
  loadEnvFile();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get<AppConfig>(APP_CONFIG);

  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'metrics'] });
  app.use(helmet());
  app.use(cookieParser());
  app.set('trust proxy', 1);
  app.enableCors({ origin: config.pwaUrl, credentials: true });
  app.enableShutdownHooks();
  setupSwagger(app);

  await app.listen(config.port);
}

void bootstrap();
