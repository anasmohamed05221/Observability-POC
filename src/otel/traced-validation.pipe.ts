import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { tracer } from './tracer';

export class TracedValidationPipe extends ValidationPipe {
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
