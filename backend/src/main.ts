import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { APP_CONFIG, AppConfig } from './config/configuration';
import { loadEnvFile } from './config/load-env';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  loadEnvFile();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const config = app.get<AppConfig>(APP_CONFIG);

  configureApp(app);
  app.use(helmet());
  app.set('trust proxy', 1);
  app.enableCors({ origin: config.pwaUrl, credentials: true });
  app.enableShutdownHooks();
  setupSwagger(app);

  await app.listen(config.port);
}

void bootstrap();
