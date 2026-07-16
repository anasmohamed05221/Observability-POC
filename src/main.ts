import 'dotenv/config';
import express from 'express';
import { createApp } from './bootstrap';
import { provider } from './tracing';

async function bootstrap() {
  const server = express();
  const app = await createApp(server);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

async function shutdown() {
  await provider.shutdown();
  process.exit(0);
}

// SIGTERM: what Docker/Kubernetes/systemd send when stopping a container in production.
// SIGINT: what Ctrl+C sends — needed to test this locally, since Windows has no real SIGTERM.
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);