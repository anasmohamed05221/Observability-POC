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

## DB query spans come from `pg` auto-instrumentation, not `@prisma/instrumentation`

**What:** `@prisma/instrumentation` is installed and registered in `src/tracing.ts`, but checking
the actual span names in a real trace (via Jaeger's API) shows it contributes nothing visible.
The `pg.connect` / `pg.query:SELECT ...` spans we see come from the plain `pg` driver
instrumentation (already active via `getNodeAutoInstrumentations()`), since Prisma 7's
`@prisma/adapter-pg` wraps `pg` directly.

**Why this matters:** `@prisma/instrumentation` was built for Prisma's old Rust query-engine
execution path. Prisma 7's driver-adapter client doesn't go through that path, so the package
likely isn't hooking into anything for us. Don't assume its presence means Prisma-level tracing
(operation name, model name, etc.) is happening — verify against real span names, same way we did
here, before relying on it.

**Kept anyway:** it's harmless to leave installed in case a future Prisma release wires it up for
driver-adapter clients too.
