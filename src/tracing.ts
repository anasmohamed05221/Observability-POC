import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { PrismaInstrumentation } from '@prisma/instrumentation';

const otlpUrl = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? 'http://localhost:4318/v1/traces';

// OTEL_EXPORTER_OTLP_HEADERS is a comma-separated "key=value" list, percent-encoded per the
// OTel spec (e.g. Grafana Cloud's copy-paste value uses %20 for the space in "Basic <token>").
const otlpHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS
  ? Object.fromEntries(
      process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',').map((pair) => {
        const [key, ...rest] = pair.split('=');
        return [key.trim(), decodeURIComponent(rest.join('='))];
      }),
    )
  : undefined;

const exporter = new OTLPTraceExporter({ url: otlpUrl, headers: otlpHeaders });
const spanProcessor = new BatchSpanProcessor(exporter);

const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'orders-api',
  }),
  spanProcessors: [spanProcessor],
});
provider.register();

registerInstrumentations({
  instrumentations: [getNodeAutoInstrumentations(), new PrismaInstrumentation()],
});

export { provider };
