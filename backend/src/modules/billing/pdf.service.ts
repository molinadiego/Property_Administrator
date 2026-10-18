import { Injectable } from '@nestjs/common';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
import PdfPrinter from 'pdfmake/js/printer';
import {
  AccountingExportData,
  INVOICE_LINE_KIND_LABELS,
  INVOICE_STATUS_LABELS,
  InvoicePdfData,
  PAYMENT_KIND_LABELS,
  PAYMENT_STATUS_LABELS,
} from './types';

const require_ = createRequire(join(process.cwd(), 'package.json'));
const PDFMAKE_ROOT = dirname(require_.resolve('pdfmake/package.json'));

const FONTS: TFontDictionary = {
  Roboto: {
    normal: join(PDFMAKE_ROOT, 'build/fonts/Roboto/Roboto-Regular.ttf'),
    bold: join(PDFMAKE_ROOT, 'build/fonts/Roboto/Roboto-Medium.ttf'),
    italics: join(PDFMAKE_ROOT, 'build/fonts/Roboto/Roboto-Italic.ttf'),
    bolditalics: join(PDFMAKE_ROOT, 'build/fonts/Roboto/Roboto-MediumItalic.ttf'),
  },
};

const STYLES = {
  title: { fontSize: 18, bold: true },
  subtitle: { fontSize: 12, bold: true },
  section: { fontSize: 11, bold: true, margin: [0, 10, 0, 4] as [number, number, number, number] },
  muted: { fontSize: 9, color: '#555555' },
  totals: { alignment: 'right' as const },
};

/**
 * In-memory PDF generation with pdfmake (spec etapa-5 §3, §4.1/§4.4, §11.6):
 * the file is never stored — it is regenerated on every download.
 */
@Injectable()
export class PdfService {
  /** PDF of one invoice (§11.1, §11.6). */
  async invoicePdf(data: InvoicePdfData): Promise<Buffer> {
    const voided = data.voidReason !== null;
    const doc: TDocumentDefinitions = {
      defaultStyle: { font: 'Roboto', fontSize: 10 },
      styles: STYLES,
      content: [
        {
          columns: [
            { text: 'FACTURA', style: 'title' },
            {
              alignment: 'right',
              stack: [
                { text: `N.º ${data.number}`, style: 'subtitle' },
                { text: INVOICE_STATUS_LABELS[data.status] ?? data.status, style: 'muted' },
              ],
            },
          ],
        },
        ...(voided
          ? [
              {
                text: `ANULADA — ${data.voidReason}`,
                color: '#b00020',
                bold: true,
                margin: [0, 4, 0, 0] as [number, number, number, number],
              },
            ]
          : []),
        { text: '\n' },
        {
          columns: [
            {
              width: '48%',
              stack: [
                { text: 'Emisor', style: 'section' },
                { text: data.issuerName, bold: true },
              ],
            },
            {
              width: '4%',
              text: '',
            },
            {
              width: '48%',
              stack: [
                { text: 'Destinatario', style: 'section' },
                { text: data.recipientName, bold: true },
              ],
            },
          ],
        },
        { text: '\n' },
        {
          columns: [
            { text: `Fecha de emisión: ${data.issueDate}` },
            { text: `Vencimiento: ${data.dueDate}` },
          ],
          columnGap: 12,
        },
        { text: `Orden: ${data.orderTitle} (${data.orderId})`, margin: [0, 2, 0, 0] as [number, number, number, number] },
        { text: 'Conceptos', style: 'section' },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 'auto'],
            body: [
              ['Concepto', 'Descripción', 'Trabajo', 'Importe (USD)'],
              ...data.lines.map((line) => [
                INVOICE_LINE_KIND_LABELS[line.kind] ?? line.kind,
                line.description,
                line.jobTitle,
                { text: line.amount, alignment: 'right' as const },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
        {
          margin: [0, 8, 0, 0] as [number, number, number, number],
          table: {
            widths: ['*', 'auto'],
            body: [
              ['Subtotal', { text: data.subtotal, alignment: 'right' as const }],
              ['Total (sin impuestos en v1, §18.2)', { text: data.total, alignment: 'right' as const, bold: true }],
            ],
          },
          layout: 'noBorders',
        },
        { text: 'Pagos registrados', style: 'section' },
        {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', 'auto', 'auto', 'auto'],
            body: [
              ['Fecha', 'Tipo', 'Estado', 'Referencia', 'Importe (USD)'],
              ...(data.payments.length > 0
                ? data.payments.map((payment) => [
                    payment.paidAt,
                    PAYMENT_KIND_LABELS[payment.kind] ?? payment.kind,
                    PAYMENT_STATUS_LABELS[payment.status] ?? payment.status,
                    payment.reference ?? '—',
                    { text: payment.amount, alignment: 'right' as const },
                  ])
                : [['—', '—', '—', '—', { text: '0.00', alignment: 'right' as const }]]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
        {
          margin: [0, 8, 0, 0] as [number, number, number, number],
          table: {
            widths: ['*', 'auto'],
            body: [
              ['Pagado neto', { text: data.paidNet, alignment: 'right' as const }],
              ['Saldo pendiente', { text: data.balance, alignment: 'right' as const, bold: true }],
            ],
          },
          layout: 'noBorders',
        },
        ...(data.notes ? [{ text: `Notas: ${data.notes}`, style: 'muted', margin: [0, 10, 0, 0] as [number, number, number, number] }] : []),
      ],
    };
    return this.render(doc);
  }

  /** PDF summary of the company's own accounting records (§3.5, §16.10). */
  async accountingPdf(data: AccountingExportData): Promise<Buffer> {
    const range = `${data.from ?? '…'} — ${data.to ?? '…'}`;
    const doc: TDocumentDefinitions = {
      defaultStyle: { font: 'Roboto', fontSize: 10 },
      styles: STYLES,
      content: [
        { text: 'Registros contables', style: 'title' },
        { text: `${data.companyName} · periodo ${range}`, style: 'muted' },
        { text: 'Facturas (emitidas y recibidas)', style: 'section' },
        {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', 'auto', 'auto', '*', 'auto', 'auto', 'auto'],
            body: [
              ['N.º', 'Estado', 'Emisión', 'Vencimiento', 'Contraparte', 'Total', 'Pagado', 'Saldo'],
              ...(data.invoices.length > 0
                ? data.invoices.map((invoice) => [
                    invoice.number !== null ? String(invoice.number) : '—',
                    INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status,
                    invoice.issueDate ?? '—',
                    invoice.dueDate ?? '—',
                    invoice.counterparty,
                    invoice.total ?? '—',
                    invoice.paidNet,
                    invoice.balance ?? '—',
                  ])
                : [['—', '—', '—', '—', '—', '—', '—', '—']]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
        { text: 'Pagos', style: 'section' },
        {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', '*'],
            body: [
              ['Fecha', 'Tipo', 'Estado', 'Importe', 'Referencia', 'Factura', 'Registrante'],
              ...(data.payments.length > 0
                ? data.payments.map((payment) => [
                    payment.paidAt,
                    PAYMENT_KIND_LABELS[payment.kind] ?? payment.kind,
                    PAYMENT_STATUS_LABELS[payment.status] ?? payment.status,
                    payment.amount,
                    payment.reference ?? '—',
                    payment.invoiceNumber !== null ? String(payment.invoiceNumber) : '—',
                    payment.registrantName,
                  ])
                : [['—', '—', '—', '—', '—', '—', '—']]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
        { text: 'Costos propios', style: 'section' },
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto', 'auto'],
            body: [
              ['Orden', 'Versión', 'Estado', 'Total', 'Enviado'],
              ...(data.costs.length > 0
                ? data.costs.map((cost) => [
                    cost.orderTitle,
                    String(cost.version),
                    cost.status === 'submitted' ? 'Enviado' : 'Borrador',
                    cost.total ?? '—',
                    cost.submittedAt ?? '—',
                  ])
                : [['—', '—', '—', '—', '—']]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
      ],
    };
    return this.render(doc);
  }

  private async render(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    // pdfmake 0.3 resolves font URLs before rendering; local file paths pass
    // through a no-op resolver untouched.
    const printer = new PdfPrinter(FONTS, undefined, {
      resolve: () => undefined,
      resolved: () => undefined,
    });
    const doc = await printer.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (error: Error) => reject(error));
      doc.end();
    });
  }
}
