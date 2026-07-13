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
