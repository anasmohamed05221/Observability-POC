# OpenTelemetry + Jaeger — Implementation Plan

Goal: add distributed tracing to the Orders API so a `POST /orders` request produces a full trace
tree in Jaeger, including our own business-logic spans and the failure/rollback case.

Current state: NestJS + Prisma + Postgres app is built and working (see `README.md`). No tracing yet.

Target span tree:

```
HTTP POST /orders              (auto)
└─ validate.request            (manual)
   └─ order.transaction        (manual — wraps the transaction)
      ├─ inventory.check       (manual) └─ db query (auto)
      ├─ inventory.reserve     (manual) └─ db query (auto)
      ├─ order.create          (manual) └─ db query (auto)
      ├─ order.items.create    (manual) └─ db query (auto)
      ├─ payment.charge        (manual — fake, small delay)
      └─ order.confirm         (manual — fake)
```

---

## Step 1 — Run Jaeger locally

**First, check ports 16686 and 4318 are actually free** — we already hit a real conflict with
Postgres on port 5432 from a native install on this machine (`netstat -ano | grep 16686` /
`grep 4318`, on Windows check with `tasklist /FI "PID eq <pid>"`). If either is taken, map Jaeger
to different host ports the same way we remapped Postgres to 5433, and adjust the exporter URL
in Step 3 to match.

Add Jaeger `all-in-one` to `docker-compose.yml` alongside Postgres.

- Port `16686` → Jaeger UI
- Port `4318` → OTLP HTTP receiver (our app sends traces here)

**Done when:** `docker compose up -d` starts Jaeger, and `http://localhost:16686` loads the UI.

---

## Step 2 — Install OTel packages

```
@opentelemetry/api
@opentelemetry/sdk-node
@opentelemetry/auto-instrumentations-node
@opentelemetry/exporter-trace-otlp-http
@opentelemetry/resources
@opentelemetry/semantic-conventions
```

`@opentelemetry/api` is easy to miss but required separately — it's what gives us `trace.getTracer(...)`
for the manual spans in Step 5. `sdk-node` alone doesn't export it.

**Done when:** packages installed, no version conflicts.

---

## Step 3 — Bootstrap the OTel SDK before Nest starts

Create `src/tracing.ts` (separate file, loaded **first**):

- Set `service.name` resource attribute (e.g. `orders-api`) — otherwise Jaeger shows `unknown_service`.
- Configure `OTLPTraceExporter` pointing at `http://localhost:4318/v1/traces`.
- Use `BatchSpanProcessor` (default is fine; can lower `scheduledDelayMillis` for faster feedback in dev).
- Enable `getNodeAutoInstrumentations()` — this auto-instruments HTTP and DB calls.
- Import `tracing.ts` as the **very first line** of `src/main.ts`, before any other import.

**Why order matters:** if Nest boots before OTel patches Node's internals, auto-instrumentation
silently does nothing — no errors, just empty traces.

**Done when:** app starts, and any request (e.g. `GET /products`) shows up as a trace in Jaeger
(just the auto HTTP span for now — nothing manual yet).

### How to actually see it in the Jaeger UI

1. Open `http://localhost:16686`.
2. Top-left **Service** dropdown → select `orders-api` (only appears after the app has sent at
   least one trace — send a request first, e.g. `curl http://localhost:3000/products`).
3. Click **Find Traces** (bottom of the left panel). A list of traces appears on the right, one
   row per request, with total duration and span count.
4. Click any trace row → opens the **waterfall view**: each span is a horizontal bar, indented
   under its parent, bar length = duration. This is where you check nesting matches the tree.
5. Click any individual span bar → side panel shows its **Tags** (our attributes from Step 6) and,
   for failed spans, a **Logs** section with the recorded exception (stack trace, message).
6. Errored spans are outlined/highlighted **red** in both the trace list and the waterfall — this
   is what you're looking for in Step 7.

Do this check after every step below that says "Done when: ... in Jaeger" — don't just trust the
app logs.

---

## Step 4 — Enable Prisma auto-instrumentation

**Resolved.** Confirmed: `previewFeatures = ["tracing"]` no longer applies — that was a Prisma
5/6-era flag tied to the old Rust query engine, which Prisma 7 removed entirely. The replacement
is a standalone package, `@prisma/instrumentation`, which registers like any other OTel
instrumentation (no `schema.prisma` change needed):

```
npm install @prisma/instrumentation
```

```ts
import { PrismaInstrumentation } from '@prisma/instrumentation';
// added into NodeSDK's instrumentations array in src/tracing.ts:
instrumentations: [getNodeAutoInstrumentations(), new PrismaInstrumentation()],
```

No flag on `PrismaClient` itself is needed either — it attaches by patching `PrismaClient`
internals globally, same mechanism as the HTTP/Express auto-instrumentations.

**Further finding, checked directly against the actual trace (not assumed):** pulled every span
name for a `GET /products` trace via Jaeger's API and none contain `prisma` — the DB spans we see
(`pg.connect`, `pg.query:SELECT ...`, `pg-pool.connect`) come from the **raw `pg` driver
instrumentation**, already active since Step 3 (Prisma 7's adapter wraps `pg` directly).
`@prisma/instrumentation` isn't visibly contributing anything on top of that — likely because it
targets Prisma's old query-engine execution path, which the driver-adapter client (Prisma 7)
doesn't use. Kept the package installed (harmless, may start working in a future Prisma release)
but the DB visibility we actually rely on comes from the `pg` instrumentation, not this package.

**Done when:** `db query` spans appear automatically under the HTTP span in Jaeger for
`GET /products` — confirmed, via `pg.query:SELECT ...` spans.

---

## Step 5 — Add manual spans, one at a time

In `OrdersService`, wrap each existing private method with `tracer.startActiveSpan(name, ...)`
— use `startActiveSpan`, not `startSpan` (only `startActiveSpan` makes child spans/DB calls nest
correctly under it).

Order to add them (check the tree in Jaeger after each one before moving to the next):

1. `validate.request` — see note below, needs its own approach.
2. `order.transaction` — wraps the whole `prisma.$transaction(...)` call.
3. `inventory.check`
4. `inventory.reserve`
5. `order.create`
6. `order.items.create`
7. `payment.charge`
8. `order.confirm`

**Note on `validate.request` specifically:** we use a *global* `ValidationPipe` (`main.ts`), and
validation happens automatically before our controller method even runs — there's no line of our
own code to wrap. A guard or plain "wrap the controller method" approach won't isolate just the
validation step. Instead, wrap the pipe itself: create a small subclass that overrides `transform()`

```ts
class TracedValidationPipe extends ValidationPipe {
  async transform(value: unknown, metadata: ArgumentMetadata) {
    return tracer.startActiveSpan('validate.request', async (span) => {
      try {
        return await super.transform(value, metadata);
      } finally {
        span.end();
      }
    });
  }
}
```

and register `app.useGlobalPipes(new TracedValidationPipe({ whitelist: true, transform: true }))`
instead of the plain `ValidationPipe`. This spans exactly the validation call, nothing more.

Pattern for each other span:

```ts
await tracer.startActiveSpan('inventory.reserve', async (span) => {
  try {
    // existing logic here
  } catch (err) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    span.end(); // easy to forget — leaked spans never show up
  }
});
```

**Done when:** the full 8-span tree above renders correctly nested in Jaeger for a successful order.

---

## Step 6 — Add attributes to each span

Standard attribute names to use:

| Attribute | Used on |
|---|---|
| `order.id` | `order.transaction`, `order.create`, `order.confirm` |
| `order.total` | `order.transaction`, `order.confirm` |
| `product.id` | `inventory.check`, `inventory.reserve` |
| `inventory.requested_qty` | `inventory.check`, `inventory.reserve` |
| `inventory.available_qty` | `inventory.check` |

**Done when:** clicking any manual span in Jaeger shows relevant business data, not just a name.

---

## Step 7 — Prove the failure/rollback trace

Request more than available stock (reuse the low-stock seed product, id 4, stock 2).

- `inventory.reserve` throws → transaction rolls back (already working, from Prisma).
- Catch the error on `order.transaction`'s span: `span.recordException(err)` +
  `span.setStatus({ code: SpanStatusCode.ERROR })`.

**Done when:** the failed trace shows **red** in Jaeger, with the exception visible on the
`order.transaction` span. Confirm via `GET /products` that stock is unchanged (proves the DB
rollback, not just that an error was thrown).

---

## Step 8 — Graceful shutdown

In `main.ts`, flush the exporter on shutdown:

```ts
process.on('SIGTERM', async () => {
  await sdk.shutdown();
  process.exit(0);
});
```

**Why:** batched spans sitting in the exporter buffer are lost if the process dies before the
batch timer fires. Without this hook, the last request before a restart can vanish from Jaeger.

**Done when:** stopping the app with `SIGTERM` doesn't lose the most recent request's trace.

---

## Step 9 — Write it up

- `README.md` — add: how to start Jaeger, how to open the UI, one screenshot of a working trace.
- `DECISIONS.md` — short notes on choices made (e.g. why `startActiveSpan`, why these attributes).
- Span tree diagram — the tree at the top of this doc is enough (hand-drawn is also fine).

---

## Quick reference — common failure modes

| Symptom | Likely cause |
|---|---|
| No traces at all in Jaeger | `tracing.ts` not imported first, or exporter URL wrong |
| `unknown_service:node` in Jaeger | `service.name` resource attribute not set |
| No `db query` spans | Missing `previewFeatures = ["tracing"]` in `schema.prisma` — or, on Prisma 7, that flag may not apply at all (see Step 4) |
| Manual spans not nested under parent | Used `startSpan` instead of `startActiveSpan` |
| Span never appears / trace looks stuck | Forgot `span.end()` |
| Trace missing right after a crash/restart | No graceful shutdown flush (`sdk.shutdown()`) |
