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

// Built once, immediately when this module loads (cold start) — not lazily on the
// first request. Building it lazily meant app construction (Express/Nest setup) ran
// tangled up with that first request's span, so traces sometimes got mis-rooted under
// an internal setup span instead of the actual request.
const serverPromise = (async () => {
  const server = express();
  await createApp(server);
  return server;
})();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const server = await serverPromise;
  server(req, res);
}
