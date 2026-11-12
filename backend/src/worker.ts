import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { loadEnvFile } from './config/load-env';

async function bootstrap(): Promise<void> {
  loadEnvFile();
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.enableShutdownHooks();
}

void bootstrap();
