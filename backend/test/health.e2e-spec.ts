import { execSync } from 'node:child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

function isDockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}

const dockerAvailable = isDockerAvailable();
const dockerRequired = process.env.REQUIRE_DOCKER === 'true';

if (dockerRequired && !dockerAvailable) {
  describe('e2e infrastructure', () => {
    it('fails when Docker is required but unavailable', () => {
      throw new Error('REQUIRE_DOCKER=true but the Docker daemon is not available');
    });
  });
}

// Locally the suite is skipped without Docker; CI sets REQUIRE_DOCKER=true
// so a missing daemon fails the build instead of silently skipping.
const suite = dockerAvailable ? describe : describe.skip;

suite('health (e2e)', () => {
  let container: StartedTestContainer;
  let app: INestApplication | undefined;

  beforeAll(async () => {
    container = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'test' })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 1))
      .start();

    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
    process.env.DATABASE_URL = `postgresql://test:test@${container.getHost()}:${container.getMappedPort(5432)}/test`;
    process.env.APP_DATABASE_URL = process.env.DATABASE_URL;

    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/app.setup');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  }, 240000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('GET /api/v1/health reports ok with the database up', async () => {
    const res = await request(app!.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('unknown routes answer with the RFC 7807 error contract', async () => {
    const res = await request(app!.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404);

    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toMatchObject({
      status: 404,
      title: 'Not Found',
      instance: '/api/v1/does-not-exist',
    });
    expect(res.body.type).toMatch(/^https:\/\/api\.home-management\.dev\/errors\//);
    expect(typeof res.body.detail).toBe('string');
    expect(typeof res.body.requestId).toBe('string');
  });

  it('GET /api/docs serves the Swagger UI', async () => {
    await request(app!.getHttpServer()).get('/api/docs').expect(200);
  });
});
