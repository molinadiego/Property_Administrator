import {
  INestApplication,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { ValidationError } from 'class-validator';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { hashToken } from './common/tokens';
import { SESSION_COOKIE } from './common/guards/session.guard';
import { PrismaService } from './prisma/prisma.service';

export const API_PREFIX = 'api/v1';
export const SWAGGER_PATH = 'api/docs';

/**
 * Shared application setup. Used by main.ts and by e2e tests so both run
 * exactly the same pipeline (prefix, validation, error contract, swagger).
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      // DTO validation failures answer 422 (spec etapa-1.md §3).
      exceptionFactory: (errors: ValidationError[]) =>
        new UnprocessableEntityException(errors.map((e) => Object.values(e.constraints ?? {}).join('; ')).join('; ')),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  setupSwagger(app);
}

export function setupSwagger(app: INestApplication): void {
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    customSiteTitle: 'Home Management API',
  });

  protectSwaggerInProduction(app);
}

/** Builds the OpenAPI document (shared by Swagger UI and the contract test). */
export function buildOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Home Management API')
    .setDescription(
      'Backend de la plataforma de administración de propiedades y trabajos de reparación.',
    )
    .setVersion('1.0')
    .addCookieAuth(SESSION_COOKIE)
    .build();

  return SwaggerModule.createDocument(app, config);
}

/**
 * In production the API surface (schema + try-it-out) requires a logged-in
 * session (spec etapa-1.md §9, DoD #5).
 */
function protectSwaggerInProduction(app: INestApplication): void {
  const config = app.get(ConfigService);
  if (config.getOrThrow<string>('NODE_ENV') !== 'production') {
    return;
  }

  const prisma = app.get(PrismaService);
  const guard = async (req: { cookies?: Record<string, string> }, res: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      const session = await prisma.session
        .findUnique({ where: { tokenHash: hashToken(token) } })
        .catch(() => null);
      if (session && !session.revokedAt && session.expiresAt > new Date()) {
        return next();
      }
    }
    res.status(401).json({
      type: 'https://api.home-management.dev/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: 'Inicia sesión para consultar la documentación.',
      instance: `/${SWAGGER_PATH}`,
    });
  };

  app.use(`/${SWAGGER_PATH}`, guard);
  app.use(`/${SWAGGER_PATH}-json`, guard);
}
