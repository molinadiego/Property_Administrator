import fs from 'node:fs';
import path from 'node:path';
import { Test } from '@nestjs/testing';

/**
 * OpenAPI contract (spec etapa-1.md §8): the exported document is committed
 * to the repo and compared on every gate run, so endpoint changes are always
 * explicit. Refresh it with `npm run openapi:update` after intentional changes.
 *
 * Needs no database: Prisma connects lazily and the document is built from
 * the code's decorators.
 */
const OPENAPI_PATH = path.resolve(__dirname, '../openapi/openapi.json');

describe('openapi contract', () => {
  it('matches the committed openapi/openapi.json', async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/placeholder';
    process.env.APP_DATABASE_URL = 'postgresql://user:pass@localhost:5432/placeholder';
    process.env.EMAIL_TRANSPORT = 'console';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    const { AppModule } = await import('../src/app.module');
    const { configureApp, buildOpenApiDocument } = await import('../src/app.setup');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const document = buildOpenApiDocument(app);
    await app.close();

    const serialized = `${JSON.stringify(document, null, 2)}\n`;

    if (process.env.UPDATE_OPENAPI === 'true') {
      fs.mkdirSync(path.dirname(OPENAPI_PATH), { recursive: true });
      fs.writeFileSync(OPENAPI_PATH, serialized, 'utf8');
      return;
    }

    const committed = fs.existsSync(OPENAPI_PATH)
      ? fs.readFileSync(OPENAPI_PATH, 'utf8')
      : '(no existe)';
    expect(
      serialized === committed
        ? 'ok'
        : 'El contrato OpenAPI cambió. Si el cambio es intencional, ejecuta npm run openapi:update y commitea openapi/openapi.json.',
    ).toBe('ok');
  }, 120000);
});
