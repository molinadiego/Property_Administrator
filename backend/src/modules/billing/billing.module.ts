import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ExcelService } from './excel.service';
import { PdfService } from './pdf.service';

/**
 * Invoices, payments and accounting downloads (spec etapa-5.md, proyect.md
 * §11, §12, §3.5): drafts → emission with a gapless per-company series →
 * payments with duplication detection → voiding, plus PDF (pdfmake) and
 * Excel (exceljs) downloads. The service is exported so cost corrections can
 * notify invoice parties (D9, §8.2). Etapa 6 adds the per-user email gate
 * for its notices (D6).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [BillingController],
  providers: [BillingService, PdfService, ExcelService],
  exports: [BillingService],
})
export class BillingModule {}
