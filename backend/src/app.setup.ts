import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

export const API_PREFIX = 'api/v1';
export const SWAGGER_PATH = 'api/docs';

/**
 * Shared application setup. Used by main.ts and by e2e tests so both run
 * exactly the same pipeline (prefix, validation, error contract, swagger).
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  setupSwagger(app);
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Home Management API')
    .setDescription(
      'Backend de la plataforma de administración de propiedades y trabajos de reparación.',
    )
    .setVersion('1.0')
    .addCookieAuth('mh_session')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    customSiteTitle: 'Home Management API',
  });
}
