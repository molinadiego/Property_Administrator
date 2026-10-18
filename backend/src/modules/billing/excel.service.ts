import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import {
  AccountingExportData,
  INVOICE_STATUS_LABELS,
  PAYMENT_KIND_LABELS,
  PAYMENT_STATUS_LABELS,
} from './types';

/**
 * Excel export of the company's own accounting records (spec etapa-5 §3,
 * §4.3, §16.10) built with exceljs; one sheet per record family, headers in
 * Spanish.
 */
@Injectable()
export class ExcelService {
  async accountingWorkbook(data: AccountingExportData): Promise<Buffer> {
    const workbook = new Workbook();
    workbook.creator = 'Property Administrator';
    workbook.created = new Date();

    const invoices = workbook.addWorksheet('Facturas');
    invoices.columns = [
      { header: 'Número', key: 'number', width: 10 },
      { header: 'Estado', key: 'status', width: 18 },
      { header: 'Emisión', key: 'issueDate', width: 12 },
      { header: 'Vencimiento', key: 'dueDate', width: 12 },
      { header: 'Contraparte', key: 'counterparty', width: 28 },
      { header: 'Orden', key: 'orderTitle', width: 28 },
      { header: 'Total (USD)', key: 'total', width: 14 },
      { header: 'Pagado (USD)', key: 'paidNet', width: 14 },
      { header: 'Saldo (USD)', key: 'balance', width: 14 },
    ];
    for (const invoice of data.invoices) {
      invoices.addRow({
        number: invoice.number !== null ? invoice.number : '—',
        status: INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status,
        issueDate: invoice.issueDate ?? '—',
        dueDate: invoice.dueDate ?? '—',
        counterparty: invoice.counterparty,
        orderTitle: invoice.orderTitle,
        total: invoice.total ?? '—',
        paidNet: invoice.paidNet,
        balance: invoice.balance ?? '—',
      });
    }
    this.boldHeader(invoices);

    const payments = workbook.addWorksheet('Pagos');
    payments.columns = [
      { header: 'Fecha', key: 'paidAt', width: 12 },
      { header: 'Tipo', key: 'kind', width: 12 },
      { header: 'Estado', key: 'status', width: 20 },
      { header: 'Importe (USD)', key: 'amount', width: 14 },
      { header: 'Referencia', key: 'reference', width: 18 },
      { header: 'Factura', key: 'invoiceNumber', width: 10 },
      { header: 'Registrante', key: 'registrantName', width: 28 },
    ];
    for (const payment of data.payments) {
      payments.addRow({
        paidAt: payment.paidAt,
        kind: PAYMENT_KIND_LABELS[payment.kind] ?? payment.kind,
        status: PAYMENT_STATUS_LABELS[payment.status] ?? payment.status,
        amount: payment.amount,
        reference: payment.reference ?? '—',
        invoiceNumber: payment.invoiceNumber !== null ? payment.invoiceNumber : '—',
        registrantName: payment.registrantName,
      });
    }
    this.boldHeader(payments);

    const costs = workbook.addWorksheet('Costos');
    costs.columns = [
      { header: 'Orden', key: 'orderTitle', width: 28 },
      { header: 'Versión', key: 'version', width: 10 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Total (USD)', key: 'total', width: 14 },
      { header: 'Enviado', key: 'submittedAt', width: 20 },
    ];
    for (const cost of data.costs) {
      costs.addRow({
        orderTitle: cost.orderTitle,
        version: cost.version,
        status: cost.status === 'submitted' ? 'Enviado' : 'Borrador',
        total: cost.total ?? '—',
        submittedAt: cost.submittedAt ?? '—',
      });
    }
    this.boldHeader(costs);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private boldHeader(sheet: Workbook['worksheets'][number]): void {
    sheet.getRow(1).font = { bold: true };
  }
}
