import type { IncomingMessage, ServerResponse } from 'http';
// Imports the *compiled* output of `nest build` (see package.json's "build" script),
// not the TS source directly — Vercel's function bundler (esbuild) doesn't support
// emitDecoratorMetadata, which NestJS's dependency injection relies on. Compiling via
// tsc first (through nest build) avoids that, since this file just requires plain JS.
// This import must also come before `express`, below: it loads tracing.ts (which
// bootstrap.ts imports first), and OTel's auto-instrumentation can only patch
// express/http/Prisma if it registers before any of those modules are first required.
import { createApp } from '../dist/src/bootstrap';
import express from 'express';

let cachedServer: express.Express | undefined;

async function getServer() {
  if (!cachedServer) {
    cachedServer = express();
    await createApp(cachedServer);
  }
  return cachedServer;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const server = await getServer();
  server(req, res);
}