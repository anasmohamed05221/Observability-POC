# Orders API

A small NestJS + Prisma (Postgres) Orders API. Places an order in a single database
transaction (check stock → reserve stock → create order → create items → charge → confirm),
rolling back cleanly if stock is insufficient.

OpenTelemetry + Jaeger tracing is planned but not yet added — see the note at the bottom.

## Stack

- NestJS (TypeScript)
- Prisma 7 ORM, `@prisma/adapter-pg` driver adapter
- Postgres (via Docker Compose)

## Prerequisites

- Node.js
- Docker (for Postgres)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env template and adjust if needed:

   ```bash
   cp .env.example .env
   ```

3. Start Postgres:

   ```bash
   docker compose up -d
   ```

4. Apply migrations:

   ```bash
   npx prisma migrate deploy
   ```

5. Seed sample products:

   ```bash
   npx prisma db seed
   ```

6. Start the app:

   ```bash
   npm run start
   ```

   The API runs on `http://localhost:3000`.
   Interactive Swagger UI: `http://localhost:3000/docs`.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/orders` | Place an order (transaction: check stock → reserve → create order → create items → charge → confirm) |
| `GET` | `/orders/:id` | Read an order back, including its items |
| `GET` | `/products` | List products |

Example request:

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"items":[{"productId":1,"quantity":2}]}'
```

If requested quantity exceeds available stock, the transaction rolls back and the request
returns `400 Bad Request` — no partial order is ever persisted.

## Notes

- Postgres is mapped to host port `5433` (not the default `5432`) to avoid conflicting with
  a native Postgres install — see `DATABASE_URL` in `.env.example`.
- Prisma 7 requires a driver adapter (`@prisma/adapter-pg`) rather than reading `DATABASE_URL`
  directly at runtime; this is wired up in `src/prisma/prisma.service.ts`.
- OpenTelemetry + Jaeger tracing has been postponed and will be added in a follow-up pass.
