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

  async sendLimitedAccess(
    to: string,
    params: { name: string; accessUrl: string; expiresAt: Date },
  ): Promise<void> {
    const subject = 'Tu acceso a Home Management';
    const text =
      `Hola ${params.name}: recibiste acceso para consultar el estado de tus órdenes.\n\n` +
      `Ingresa aquí: ${params.accessUrl}\n` +
      `El enlace vence el ${params.expiresAt.toISOString()}.\n` +
      `Si no esperabas este mensaje, ignora este correo.\n`;
    const html =
      `<p>Hola ${escapeHtml(params.name)}: recibiste acceso para consultar el estado de tus órdenes.</p>` +
      `<p><a href="${escapeHtml(params.accessUrl)}">Ingresa a tu panel</a></p>` +
      `<p>El enlace vence el ${params.expiresAt.toISOString()}. Si no esperabas este mensaje, ignora este correo.</p>`;
    await this.send({ to, subject, html, text });
  }

  /** Costs submitted to the recipient (spec etapa-4.md §8.1, §14.1). */
  async sendCostsSubmitted(
    to: string,
    params: { orderTitle: string; version: number; total: string; submittedByName: string },
  ): Promise<void> {
    const subject = `Costos enviados de la orden "${params.orderTitle}"`;
    const text =
      `${params.submittedByName} envió los costos de la orden "${params.orderTitle}" ` +
      `(versión ${params.version}, total USD ${params.total}).\n\n` +
      `Consulta el detalle en la plataforma.\n`;
    const html =
      `<p>${escapeHtml(params.submittedByName)} envió los costos de la orden ` +
      `<strong>${escapeHtml(params.orderTitle)}</strong> (versión ${params.version}, ` +
      `total USD ${escapeHtml(params.total)}).</p>` +
      `<p>Consulta el detalle en la plataforma.</p>`;
    await this.send({ to, subject, html, text });
  }

  /** Cost correction notified to the original recipient (§8.2, §14.1). */
  async sendCostCorrected(
    to: string,
    params: { orderTitle: string; version: number; submittedByName: string },
  ): Promise<void> {
    const subject = `Corrección de costos de la orden "${params.orderTitle}"`;
    const text =
      `${params.submittedByName} corrigió los costos de la orden "${params.orderTitle}" ` +
      `(nueva versión ${params.version}). La versión anterior se conserva en el historial.\n\n` +
      `Consulta el detalle en la plataforma.\n`;
    const html =
      `<p>${escapeHtml(params.submittedByName)} corrigió los costos de la orden ` +
      `<strong>${escapeHtml(params.orderTitle)}</strong> (nueva versión ${params.version}). ` +
      `La versión anterior se conserva en el historial.</p>` +
      `<p>Consulta el detalle en la plataforma.</p>`;
    await this.send({ to, subject, html, text });
  }

  /** Authorization request raised by an assignee (spec etapa-4.md §14.1). */
  async sendAuthorizationRequested(
    to: string,
    params: { orderTitle: string; type: 'exceed_spending_limit' | 'additional_work' },
  ): Promise<void> {
    const subject = `Solicitud de autorización para la orden "${params.orderTitle}"`;
    const kind =
      params.type === 'exceed_spending_limit'
        ? 'superar el límite de gasto'
        : 'un trabajo adicional';
    const text =
      `Se solicitó autorización para ${kind} en la orden "${params.orderTitle}".\n\n` +
      `Revisa y resuelve la solicitud en la plataforma.\n`;
    const html =
      `<p>Se solicitó autorización para <strong>${kind}</strong> en la orden ` +
      `<strong>${escapeHtml(params.orderTitle)}</strong>.</p>` +
      `<p>Revisa y resuelve la solicitud en la plataforma.</p>`;
    await this.send({ to, subject, html, text });
  }

  /** Resolution (approval/rejection) of an authorization request (§14.1). */
  async sendAuthorizationResolved(
    to: string,
    params: {
      orderTitle: string;
      type: 'exceed_spending_limit' | 'additional_work';
      approved: boolean;
      note?: string | null;
    },
  ): Promise<void> {
    const subject = params.approved
      ? `Autorización aprobada para la orden "${params.orderTitle}"`
      : `Solicitud rechazada para la orden "${params.orderTitle}"`;
    const kind =
      params.type === 'exceed_spending_limit'
        ? 'superar el límite de gasto'
        : 'un trabajo adicional';
    const text =
      (params.approved
        ? `Se aprobó la autorización para ${kind} en la orden "${params.orderTitle}".\n`
        : `Se rechazó la solicitud para ${kind} en la orden "${params.orderTitle}".\n`) +
      (params.note ? `Motivo: ${params.note}\n` : '') +
      `\nConsulta el detalle en la plataforma.\n`;
    const html =
      `<p>${params.approved ? 'Se aprobó la autorización' : 'Se rechazó la solicitud'} para ` +
      `<strong>${kind}</strong> en la orden <strong>${escapeHtml(params.orderTitle)}</strong>.</p>` +
      (params.note ? `<p>Motivo: ${escapeHtml(params.note)}</p>` : '') +
      `<p>Consulta el detalle en la plataforma.</p>`;
    await this.send({ to, subject, html, text });
  }

  /** Invoice emitted to this recipient (spec etapa-5 §14.1, decisión P2 — D10). */
  async sendInvoiceIssued(
    to: string,
    params: {
      invoiceNumber: number;
      orderTitle: string;
      total: string;
      issuerName: string;
      recipientName: string;
    },
  ): Promise<void> {
    const subject = `Factura N.º ${params.invoiceNumber} — orden "${params.orderTitle}"`;
    const text =
      `${params.issuerName} emitió la factura N.º ${params.invoiceNumber} a ${params.recipientName} ` +
      `por la orden "${params.orderTitle}" (total USD ${params.total}).\n\n` +
      `Descarga el PDF desde la plataforma.\n`;
    const html =
      `<p>${escapeHtml(params.issuerName)} emitió la factura <strong>N.º ${params.invoiceNumber}</strong> ` +
      `a <strong>${escapeHtml(params.recipientName)}</strong> por la orden ` +
      `<strong>${escapeHtml(params.orderTitle)}</strong> (total USD ${escapeHtml(params.total)}).</p>` +
      `<p>Descarga el PDF desde la plataforma.</p>`;
    await this.send({ to, subject, html, text });
  }

  /** Voided invoice notice (spec etapa-5 §11.5, §14.1). */
  async sendInvoiceVoided(
    to: string,
    params: { invoiceNumber: number; orderTitle: string; reason: string },
  ): Promise<void> {
    const subject = `Factura N.º ${params.invoiceNumber} anulada — orden "${params.orderTitle}"`;
    const text =
      `La factura N.º ${params.invoiceNumber} de la orden "${params.orderTitle}" fue anulada.\n` +
      `Motivo: ${params.reason}\n\nConsulta el detalle en la plataforma.\n`;
    const html =
      `<p>La factura <strong>N.º ${params.invoiceNumber}</strong> de la orden ` +
      `<strong>${escapeHtml(params.orderTitle)}</strong> fue <strong>anulada</strong>.</p>` +
      `<p>Motivo: ${escapeHtml(params.reason)}</p><p>Consulta el detalle en la plataforma.</p>`;
    await this.send({ to, subject, html, text });
  }

  /** Payment or refund registered against an invoice (§11.1, §14.1, P5). */
  async sendPaymentRecorded(
    to: string,
    params: {
      invoiceNumber: number;
      orderTitle: string;
      amount: string;
      kind: 'charge' | 'refund';
      paidAt: string;
    },
  ): Promise<void> {
    const isRefund = params.kind === 'refund';
    const subject = `${isRefund ? 'Devolución' : 'Pago'} registrado — factura N.º ${params.invoiceNumber}`;
    const text =
      `Se registró ${isRefund ? 'una devolución' : 'un pago'} de USD ${params.amount} el ${params.paidAt} ` +
      `sobre la factura N.º ${params.invoiceNumber} de la orden "${params.orderTitle}".\n\n` +
      `Consulta el detalle en la plataforma.\n`;
    const html =
      `<p>Se registró <strong>${isRefund ? 'una devolución' : 'un pago'}</strong> de USD ` +
      `<strong>${escapeHtml(params.amount)}</strong> el ${escapeHtml(params.paidAt)} sobre la factura ` +
      `<strong>N.º ${params.invoiceNumber}</strong> de la orden <strong>${escapeHtml(params.orderTitle)}</strong>.</p>` +
      `<p>Consulta el detalle en la plataforma.</p>`;
    await this.send({ to, subject, html, text });
  }

  /** Suspected duplicate: warns the registrant (§11.1, D6). */
  async sendPaymentDuplicateSuspect(
    to: string,
    params: { invoiceNumber: number; amount: string; paidAt: string },
  ): Promise<void> {
    const subject = `Posible pago duplicado — factura N.º ${params.invoiceNumber}`;
    const text =
      `Se registró un pago de USD ${params.amount} el ${params.paidAt} que coincide con otro ya ` +
      `registrado en la factura N.º ${params.invoiceNumber}. Quedó marcado como posible duplicado ` +
      `y no suma hasta que una de las partes lo concilie.\n\n` +
      `Consulta el detalle en la plataforma.\n`;
    const html =
      `<p>Se registró un pago de USD <strong>${escapeHtml(params.amount)}</strong> el ` +
      `${escapeHtml(params.paidAt)} que coincide con otro ya registrado en la factura ` +
      `<strong>N.º ${params.invoiceNumber}</strong>.</p>` +
      `<p>Quedó marcado como <strong>posible duplicado</strong> y no suma hasta que una de las partes lo concilie.</p>`;
    await this.send({ to, subject, html, text });
  }

  /** Cost correction notice (spec etapa-5 D9, proyect.md §8.2). */
  async sendCostCorrectionNotice(
    to: string,
    params: { orderTitle: string; invoiceNumber: number },
  ): Promise<void> {
    const subject = `Costos corregidos — factura N.º ${params.invoiceNumber} sin cambios`;
    const text =
      `Se corrigieron los costos de la orden "${params.orderTitle}". ` +
      `La factura N.º ${params.invoiceNumber} ya emitida no cambió; solo recibe este aviso (§8.2).\n\n` +
      `Consulta el detalle en la plataforma.\n`;
    const html =
      `<p>Se corrigieron los costos de la orden <strong>${escapeHtml(params.orderTitle)}</strong>.</p>` +
      `<p>La factura <strong>N.º ${params.invoiceNumber}</strong> ya emitida <strong>no cambió</strong>; ` +
      `solo recibe este aviso (§8.2).</p>`;
    await this.send({ to, subject, html, text });
  }

  /**
   * Generic notice email (spec etapa-6.md §4.3, D6): callers build the
   * message and gate it with the user's preferences before sending.
   */
  async sendNotice(
    to: string,
    message: { subject: string; text: string; html: string },
  ): Promise<void> {
    await this.send({ to, ...message });
  }

  private async send(message: EmailMessage): Promise<void> {
    await this.transport.send(message);
    this.capturedEmails.push({ ...message, sentAt: new Date() });
  }
}
