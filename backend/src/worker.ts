import 'reflect-metadata';
import { createServer } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { loadEnvFile } from './config/load-env';
import { collectDefaults, register } from './modules/metrics/metrics';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  loadEnvFile();
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  // The worker has no HTTP API; Prometheus scrapes its queue and delivery metrics here.
  collectDefaults('campussport_worker_');
  const port = Number(process.env.WORKER_METRICS_PORT ?? 9101);
  const server = createServer((req, res) => {
    if (req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    register
      .metrics()
      .then((body) => res.writeHead(200, { 'Content-Type': register.contentType }).end(body))
      .catch(() => res.writeHead(500).end());
  });
  server.listen(port);
  process.on('SIGTERM', () => server.close());
}

void bootstrap();
