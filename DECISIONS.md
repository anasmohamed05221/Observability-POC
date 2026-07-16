# Decisions — Observability (OpenTelemetry + Jaeger)

Short notes on non-obvious observability choices, and why. Read this before assuming something
is "just how it's set up" — several of these are deliberate dev-only shortcuts that would need
to change for production.

---

## Jaeger `all-in-one`, in-memory storage — dev/demo only

**What:** Jaeger runs as the single `all-in-one` Docker image, no persistent volume for trace data.

**Why:** Bundles the OTLP receiver, storage, and UI into one container — fastest way to get
tracing visible locally. Traces are stored in-memory and lost on container restart.

**Change for production:** `all-in-one` does not scale and does not persist. Production needs
Jaeger's collector/query components run separately, backed by a real storage backend
(Elasticsearch or Cassandra are the common choices). This is a config/deployment change, not a
code change — nothing in the app needs to know which Jaeger setup it's talking to.

---

## Deployment: Vercel (app) + Neon (DB) + Render (Jaeger)

**What:** App runs on Vercel as a serverless function. DB is Vercel Postgres (Neon). Traces go to
a self-hosted Jaeger `all-in-one` on Render.

**Why a custom Dockerfile + nginx, instead of just deploying the stock Jaeger image:** Jaeger
needs two ports — `4318` (OTLP ingest) and `16686` (UI) — but Render's free Web Service tier only
exposes one public port per service. `infra/jaeger-render/Dockerfile` copies Jaeger's binary into
an `nginx:alpine` base and runs both processes in one container; nginx listens on the one exposed
port and routes by path (`/v1/traces` → Jaeger, everything else → its UI), so both stay reachable
through that single port.

**Why serverless changed the tracing code:** Vercel functions can freeze right after sending a
response, with no guaranteed shutdown hook. Traces are now flushed explicitly per-request instead
of on shutdown, and the handler awaits both the response finishing and the flush completing
before returning — otherwise Vercel could freeze mid-export, losing whichever span (often the
request's own root span) hadn't finished sending yet.

**Why this Jaeger deployment is ephemeral on purpose:** Render's free tier has no persistent
disk, so traces reset on restart. Accepted as a demo-only tradeoff — real production would run
this on a VPS with real storage, per the original brief.

---

## Graceful shutdown flush, verified directly (not via Windows signals)

**What:** `main.ts` calls `provider.shutdown()` on both `SIGTERM` and `SIGINT`, to flush any spans
still sitting in the batch exporter's buffer before the process exits.

**Why tested indirectly:** tried to verify this the obvious way (start the app, place an order,
kill the process immediately, check Jaeger) but Windows doesn't reliably deliver `SIGINT`/`SIGTERM`
to a background/non-console process the way Linux does — `taskkill` without `/F` outright refused
("can only be terminated forcefully"). So the OS-signal path itself couldn't be exercised locally.

**What we verified instead:** ran a standalone script that creates one span and calls
`provider.shutdown()` immediately (no wait for the batch timer), and confirmed that span *did* land in
Jaeger. This proves `provider.shutdown()` itself forces an immediate flush — the actual mechanism this
whole step depends on. The `process.on('SIGTERM'/'SIGINT', ...)` wiring around it is standard Node
and not worth re-verifying; the OS's ability to deliver those signals is a non-issue in the real
target environment (Docker/Linux sends real `SIGTERM` on `docker stop`).
