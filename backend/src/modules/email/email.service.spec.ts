import type { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConsoleEmailTransport, EmailMessage, maskTokens } from './email.service';

/** Structural stub: unit specs must not load @nestjs/config at runtime (ESM). */
function configWith(outboxFile: string | undefined): ConfigService {
  return {
    get: (key: string) => (key === 'EMAIL_OUTBOX_FILE' ? outboxFile : undefined),
  } as unknown as ConfigService;
}

const message: EmailMessage = {
  to: 'invitado@demo.test',
  subject: 'Invitación a Gestión Demo en Home Management',
  text:
    'Ana te invitó a unirte al espacio "Gestión Demo".\n\n' +
    'Acepta la invitación aquí: http://localhost:5173/invitations/abc-DEF_123\n' +
    'El enlace vence el 2026-11-01T00:00:00.000Z.\n',
  html: '<p>…</p>',
};

const resetMessage: EmailMessage = {
  to: 'ana@demo.test',
  subject: 'Recupera tu contraseña de Home Management',
  text: 'Hazlo aquí: http://localhost:5173/reset-password?token=raw-reset-token-1\n',
  html: '<p>…</p>',
};

describe('maskTokens (etapa-1 §11: tokens nunca en logs de la aplicación)', () => {
  it('masks query-style tokens (password reset)', () => {
    const masked = maskTokens(resetMessage.text);
    expect(masked).toContain('token=***');
    expect(masked).not.toContain('raw-reset-token-1');
  });

  it('masks path-style tokens (invitation links)', () => {
    const masked = maskTokens(message.text);
    expect(masked).toContain('/invitations/***');
    expect(masked).not.toContain('abc-DEF_123');
  });
});

describe('ConsoleEmailTransport', () => {
  it('appends each email in full to the outbox file when configured (F1-D4/§12)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'outbox-'));
    const file = join(dir, 'outbox.jsonl');
    const config = configWith(file);
    const transport = new ConsoleEmailTransport(config);

    await transport.send(message);
    await transport.send(resetMessage);

    const lines = (await readFile(file, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    expect(lines[1].text).toContain('token=raw-reset-token-1');
  });

  it('writes no outbox when EMAIL_OUTBOX_FILE is absent (production shape)', async () => {
    const transport = new ConsoleEmailTransport(configWith(undefined));
    await expect(transport.send(message)).resolves.toBeUndefined();
  });
});
