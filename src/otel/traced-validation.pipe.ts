import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { tracer } from './tracer';

export class TracedValidationPipe extends ValidationPipe {
  async transform(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<unknown> {
    return tracer.startActiveSpan(
      'validate.request',
      async (span): Promise<unknown> => {
        try {
          return (await super.transform(value, metadata)) as unknown;
        } finally {
          span.end();
        }
      },
    );
  }
}
