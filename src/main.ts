import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { json } from 'express';
import { AppModule } from './app/app.module';
import { GatewayService } from './app/gateway/gateway.service';
import { AllExceptionsFilter, LoggingInterceptor } from '@jrumandal/shared';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Build the stitched schema eagerly, BEFORE the NestJS router is set up.
  // NestFactory.create() does not await OnModuleInit, so we trigger it here.
  // (onModuleInit is idempotent, so the later lifecycle call is a no-op.)
  const gatewayService = app.get(GatewayService);
  await gatewayService.onModuleInit();

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('API Gateway')
    .setDescription('GraphQL gateway that stitches catalog, cart, and user services.')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  // Apollo Server with stitched schema
  const apolloServer = new ApolloServer({ schema: gatewayService.schema });
  await apolloServer.start();

  // Register /graphql BEFORE app.listen() so the NestJS router (and its 404
  // handler) does not swallow the request.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use('/graphql', json(), expressMiddleware(apolloServer));

  const port = parseInt(process.env.PORT || '4200', 10);
  await app.listen(port);
  console.log(`[api-gateway] listening on http://localhost:${port}`);
  console.log(`[api-gateway] GraphQL:  http://localhost:${port}/graphql`);
  console.log(`[api-gateway] Health:   http://localhost:${port}/health`);
  console.log(`[api-gateway] Docs:     http://localhost:${port}/api-docs`);
}

bootstrap();
