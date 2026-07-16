import type { IncomingMessage, ServerResponse } from 'http';
import express from 'express';
// Imports the *compiled* output of `nest build` (see package.json's "build" script),
// not the TS source directly — Vercel's function bundler (esbuild) doesn't support
// emitDecoratorMetadata, which NestJS's dependency injection relies on. Compiling via
// tsc first (through nest build) avoids that, since this file just requires plain JS.
import { createApp } from '../dist/src/bootstrap';

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