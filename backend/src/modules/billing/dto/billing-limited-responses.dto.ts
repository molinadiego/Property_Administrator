import { ApiProperty } from '@nestjs/swagger';
import {
  InvoiceLineKind,
  PaymentKind,
  PaymentMethod,
  PaymentStatus,
} from '../../../generated/prisma/enums';
import { DerivedInvoiceStatus } from '../invoice-rules';

/**
 * Response DTOs for the limited-invoice endpoints (Option A, approved
 * 20/10/2026: frontend spec F3-D1). Documentation only — no behaviour
 * change — they mirror `billing.service.serializeInvoice` (the same shape
 * the company surface answers) so the generated API client gets real types
 * (frontend AGENTS.md). Money values are decimal strings (§12).
 */

const DERIVED_INVOICE_STATUSES = [
  'draft',
  'issued',
  'partially_paid',
  'paid',
  'overdue',
  'voided',
] as const satisfies readonly DerivedInvoiceStatus[];

/** Issuer company of the invoice (§11). */
export class InvoiceIssuerViewDto {
  @ApiProperty({ format: 'uuid' })
  companyId: string;

  @ApiProperty()
  name: string;
}

/** Recipient of the invoice (§11.3): a company or the own client (D1b);
 * only the field matching `kind` is present in the payload. */
export class InvoiceRecipientViewDto {
  @ApiProperty({ enum: ['company', 'tenant'] })
  kind: 'company' | 'tenant';

  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false })
  companyId: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false })
  tenantId: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  name: string | null;
}

/** One payment or refund against the invoice (§11.1, etapa-5 D6/D7). */
export class InvoicePaymentViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: PaymentKind })
  kind: PaymentKind;

  @ApiProperty({ enum: PaymentStatus, description: 'Solo `recorded` cuenta para el saldo (D6)' })
  status: PaymentStatus;

  @ApiProperty({ description: 'Importe en formato decimal string (§12)' })
  amount: string;

  @ApiProperty({ format: 'date' })
  paidAt: string;

  @ApiProperty({ enum: PaymentMethod, nullable: true, required: false })
  method: PaymentMethod | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  reference: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  notes: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false })
  duplicateOfId: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, required: false })
  reconciledAt: string | null;

  @ApiProperty({ format: 'uuid', description: 'Empresa que registró el pago' })
  registeredByCompanyId: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

/** One invoice row as the limited list answers it (no lines, §11.3:
 * drafts are never listed). */
export class LimitedInvoiceViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  orderId: string;

  @ApiProperty()
  orderTitle: string;

  @ApiProperty({
    enum: DERIVED_INVOICE_STATUSES,
    description: 'Estado base derivado con pagos y vencimiento (etapa-5)',
  })
  status: DerivedInvoiceStatus;

  @ApiProperty({ type: Number, nullable: true, required: false, description: 'Número secuencial asignado al emitir (D2)' })
  number: number | null;

  @ApiProperty({ type: String, format: 'date', nullable: true, required: false })
  issueDate: string | null;

  @ApiProperty({ type: String, format: 'date', nullable: true, required: false })
  dueDate: string | null;

  @ApiProperty({ type: String, nullable: true, required: false, description: 'Decimal string (§12)' })
  subtotal: string | null;

  @ApiProperty({ type: String, nullable: true, required: false, description: 'Tasa en formato string (§12)' })
  taxRate: string | null;

  @ApiProperty({ type: String, nullable: true, required: false, description: 'Decimal string (§12)' })
  taxTotal: string | null;

  @ApiProperty({ type: String, nullable: true, required: false, description: 'Decimal string (§12)' })
  total: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  notes: string | null;

  @ApiProperty({ description: 'Pagos netos (charges − refunds válidos), decimal string' })
  paidNet: string;

  @ApiProperty({ type: String, nullable: true, required: false, description: 'Saldo restante, decimal string' })
  balance: string | null;

  @ApiProperty({ type: InvoiceIssuerViewDto })
  issuer: InvoiceIssuerViewDto;

  @ApiProperty({ type: InvoiceRecipientViewDto })
  recipient: InvoiceRecipientViewDto;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, required: false })
  voidedAt: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  voidReason: string | null;

  @ApiProperty({ type: [InvoicePaymentViewDto] })
  payments: InvoicePaymentViewDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

/** One invoice line (only in the detail answer). */
export class InvoiceLineViewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  jobId: string;

  @ApiProperty()
  jobTitle: string;

  @ApiProperty({ enum: InvoiceLineKind })
  kind: InvoiceLineKind;

  @ApiProperty()
  description: string;

  @ApiProperty({ description: 'Importe en formato decimal string (§12)' })
  amount: string;

  @ApiProperty({ description: 'Línea gravable por defecto; el emisor la quita (§11.6)' })
  taxable: boolean;
}

/** Invoice detail for a limited account: rows plus its lines. */
export class LimitedInvoiceDetailViewDto extends LimitedInvoiceViewDto {
  @ApiProperty({ type: [InvoiceLineViewDto] })
  lines: InvoiceLineViewDto[];
}
