import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface CapturedEmail extends EmailMessage {
  sentAt: Date;
}

export const EMAIL_TRANSPORT = 'EMAIL_TRANSPORT';

/** Transport abstraction: console (dev/test) or Resend (production). */
export abstract class EmailTransport {
  abstract send(message: EmailMessage): Promise<void>;
}

/** Prints the email to the application log; tokens are masked (spec §11). */
@Injectable()
export class ConsoleEmailTransport extends EmailTransport {
  private readonly logger = new Logger('email');

  async send(message: EmailMessage): Promise<void> {
    const maskedText = message.text.replace(/token=[^&\s]+/g, 'token=***');
    this.logger.log(
      `[console-email] to=${message.to} subject="${message.subject}"\n${maskedText}`,
    );
  }
}

/** Resend transport (docs/stack.md §3): used when EMAIL_TRANSPORT=resend. */
@Injectable()
export class ResendEmailTransport extends EmailTransport {
  private readonly client: Resend;
  private readonly from: string;

  constructor(config: ConfigService) {
    super();
    this.client = new Resend(config.getOrThrow<string>('RESEND_API_KEY'));
    this.from = config.getOrThrow<string>('EMAIL_FROM');
  }

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.message}`);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Transactional email facade (invitations and password recovery).
 * Keeps an in-memory capture of sent emails for dev tooling and tests; the
 * real token never reaches the application log.
 */
@Injectable()
export class EmailService {
  private readonly capturedEmails: CapturedEmail[] = [];

  constructor(
    @Inject(EMAIL_TRANSPORT) private readonly transport: EmailTransport,
    private readonly config: ConfigService,
  ) {}

  /** Emails captured in memory (console transport: dev/test). Read-only. */
  get captured(): readonly CapturedEmail[] {
    return this.capturedEmails;
  }

  async sendInvitation(
    to: string,
    params: { companyName: string; inviterName: string; acceptUrl: string; expiresAt: Date },
  ): Promise<void> {
    const subject = `Invitación a ${params.companyName} en Home Management`;
    const text =
      `${params.inviterName} te invitó a unirte al espacio "${params.companyName}".\n\n` +
      `Acepta la invitación aquí: ${params.acceptUrl}\n` +
      `El enlace vence el ${params.expiresAt.toISOString()}.\n`;
    const html =
      `<p><strong>${escapeHtml(params.inviterName)}</strong> te invitó a unirte al espacio ` +
      `<strong>${escapeHtml(params.companyName)}</strong>.</p>` +
      `<p><a href="${escapeHtml(params.acceptUrl)}">Aceptar invitación</a></p>` +
      `<p>El enlace vence el ${params.expiresAt.toISOString()}.</p>`;
    await this.send({ to, subject, html, text });
  }

  async sendPasswordReset(
    to: string,
    params: { name: string; resetUrl: string; expiresAt: Date },
  ): Promise<void> {
    const subject = 'Recupera tu contraseña de Home Management';
    const text =
      `Hola ${params.name}: recibimos un pedido para restablecer tu contraseña.\n\n` +
      `Hazlo aquí: ${params.resetUrl}\n` +
      `El enlace vence el ${params.expiresAt.toISOString()}.\n` +
      `Si no fuiste tú, ignora este mensaje.\n`;
    const html =
      `<p>Hola ${escapeHtml(params.name)}: recibimos un pedido para restablecer tu contraseña.</p>` +
      `<p><a href="${escapeHtml(params.resetUrl)}">Restablecer contraseña</a></p>` +
      `<p>El enlace vence el ${params.expiresAt.toISOString()}. Si no fuiste tú, ignora este mensaje.</p>`;
    await this.send({ to, subject, html, text });
  }

  private async send(message: EmailMessage): Promise<void> {
    await this.transport.send(message);
    this.capturedEmails.push({ ...message, sentAt: new Date() });
  }
}
