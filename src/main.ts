import { sdk } from './tracing';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TracedValidationPipe } from './otel/traced-validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new TracedValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Orders API')
    .setDescription('Orders API with a single Prisma transaction (check stock → reserve → create order → create items → charge → confirm)')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

async function shutdown() {
  await sdk.shutdown();
  process.exit(0);
}

// SIGTERM: what Docker/Kubernetes/systemd send when stopping a container in production.
// SIGINT: what Ctrl+C sends — needed to test this locally, since Windows has no real SIGTERM.
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
