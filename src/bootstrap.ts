import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TracedValidationPipe } from './otel/traced-validation.pipe';
import { provider } from './tracing';

export async function createApp(server: express.Express) {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
  app.useGlobalPipes(new TracedValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Orders API')
    .setDescription('Orders API with a single Prisma transaction (check stock → reserve → create order → create items → charge → confirm)')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  app.use((_req, res, next) => {
    res.on('finish', () => {
      void provider.forceFlush();
    });
    next();
  });

  await app.init();
  return app;
}