/**
 * Plain data contracts handed to the PDF/Excel builders (spec etapa-5 §3,
 * §4.1, §4.3): presentation services never touch Prisma types.
 */

export interface InvoicePdfData {
  number: number;
  status: string;
  issueDate: string;
  dueDate: string;
  orderTitle: string;
  orderId: string;
  issuerName: string;
  recipientName: string;
  lines: Array<{
    kind: string;
    description: string;
    jobTitle: string;
    amount: string;
  }>;
  subtotal: string;
  total: string;
  payments: Array<{
    paidAt: string;
    kind: string;
    status: string;
    amount: string;
    reference: string | null;
  }>;
  paidNet: string;
  balance: string;
  notes: string | null;
  voidReason: string | null;
}

export interface AccountingExportData {
  companyName: string;
  from: string | null;
  to: string | null;
  invoices: Array<{
    number: number | null;
    status: string;
    issueDate: string | null;
    dueDate: string | null;
    counterparty: string;
    orderTitle: string;
    total: string | null;
    paidNet: string;
    balance: string | null;
  }>;
  payments: Array<{
    paidAt: string;
    kind: string;
    status: string;
    amount: string;
    reference: string | null;
    invoiceNumber: number | null;
    registrantName: string;
  }>;
  costs: Array<{
    orderTitle: string;
    version: number;
    status: string;
    total: string | null;
    submittedAt: string | null;
  }>;
}

/** Spanish labels shared by both builders (jurisdiction EE.UU., §11.6). */
export const INVOICE_LINE_KIND_LABELS: Record<string, string> = {
  material: 'Materiales',
  labor: 'Mano de obra',
  tool_rental: 'Alquiler de herramientas',
  travel: 'Desplazamiento',
  other: 'Otros cargos',
};

export const PAYMENT_KIND_LABELS: Record<string, string> = {
  charge: 'Pago',
  refund: 'Devolución',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  recorded: 'Registrado',
  duplicate_suspect: 'Posible duplicado',
  duplicate_confirmed: 'Duplicado confirmado',
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  issued: 'Emitida',
  partially_paid: 'Parcialmente pagada',
  paid: 'Pagada',
  overdue: 'Vencida',
  voided: 'Anulada',
};
