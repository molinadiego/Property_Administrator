import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentLimited } from '../../common/decorators/current-limited.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { LimitedAccess, LimitedAccessGuard } from '../../common/guards/limited-access.guard';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { BillingService } from './billing.service';
import { AccountingExportQueryDto } from './dto/accounting-export.query.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { InvoicesQueryDto } from './dto/invoices.query.dto';
import { PatchInvoiceDto } from './dto/patch-invoice.dto';
import { PutInvoiceLinesDto } from './dto/put-lines.dto';
import { ReconcilePaymentDto } from './dto/reconcile-payment.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';

/**
 * Invoices, payments and accounting downloads (spec etapa-5.md §4). Every
 * company route is tenant-scoped by `CompanyAccessGuard`; the limited routes
 * under `/limited/:token/…` are read-only (P3, D13).
 */
@ApiTags('billing')
@ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // =========================================================================
  // §4.1 Invoices
  // =========================================================================

  @Get('companies/:id/invoices')
  @UseGuards(CompanyAccessGuard)
  @ApiOperation({ summary: 'Facturas emitidas y recibidas por la empresa (§11.3)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Página de facturas con cursor' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Empresa fuera de alcance (404)' })
  list(@CurrentCompany() access: CompanyAccess, @Query() query: InvoicesQueryDto) {
    return this.billingService.listInvoices(access, query);
  }

  @Post('companies/:id/invoices')
  @UseGuards(CompanyAccessGuard)
  @ApiOperation({ summary: 'Crea borrador de una orden facturable (D1a/D1b, §11.1, §11.4)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Borrador creado (sin número ni total)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Orden no aceptada o no terminada (409)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Orden inexistente o fuera de alcance (404)' })
  create(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.billingService.createDraft(access, auth, dto);
  }

  @Get('companies/:id/invoices/:invId')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'invId', description: 'Identificador de la factura' })
  @ApiOperation({ summary: 'Detalle de factura: renglones, pagos, saldo y estado (§20.4)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Factura visible para la parte' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Factura ajena o borrador del destinatario (404)' })
  get(@CurrentCompany() access: CompanyAccess, @Param('invId') invId: string) {
    return this.billingService.getInvoice(access, invId);
  }

  @Patch('companies/:id/invoices/:invId')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'invId', description: 'Identificador de la factura' })
  @ApiOperation({ summary: 'Edita notas/vencimiento de un borrador (§11.5)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Borrador actualizado' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Solo el emisor edita (403)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Factura emitida: inmutable (409)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Sin campos que cambiar (422)' })
  patch(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('invId') invId: string,
    @Body() dto: PatchInvoiceDto,
  ) {
    return this.billingService.updateDraft(access, auth, invId, dto);
  }

  @Put('companies/:id/invoices/:invId/lines')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'invId', description: 'Identificador de la factura' })
  @ApiOperation({ summary: 'Reemplaza los renglones del borrador (§11.1, §11.4)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Renglones reemplazados' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Solo el emisor edita (403)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Factura emitida: inmutable (409)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Trabajo no facturable por la empresa (422)' })
  putLines(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('invId') invId: string,
    @Body() dto: PutInvoiceLinesDto,
  ) {
    return this.billingService.putLines(access, auth, invId, dto);
  }

  @Post('companies/:id/invoices/:invId/emit')
  @UseGuards(CompanyAccessGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'invId', description: 'Identificador de la factura' })
  @ApiOperation({ summary: 'Emite el borrador: número correlativo, totales congelados, correo (D2, D5)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Factura emitida (204)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Ya emitida u orden no facturable (409)' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Solo el emisor emite (403)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Sin renglones, total 0 o vencimiento pasado (422)' })
  emit(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('invId') invId: string,
  ): Promise<void> {
    return this.billingService.emit(access, auth, invId);
  }

  @Get('companies/:id/invoices/:invId/pdf')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'invId', description: 'Identificador de la factura' })
  @ApiOperation({ summary: 'PDF de la factura emitida o anulada (§11.1, §11.6)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'application/pdf' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Borrador: aún sin emitir (409)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Factura ajena (404)' })
  async pdf(@CurrentCompany() access: CompanyAccess, @Param('invId') invId: string): Promise<StreamableFile> {
    const { buffer, contentType, filename } = await this.billingService.getPdf(access, invId);
    return new StreamableFile(buffer, { type: contentType, disposition: `attachment; filename="${filename}"` });
  }

  @Post('companies/:id/invoices/:invId/void')
  @UseGuards(CompanyAccessGuard)
  @RequireRole('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'invId', description: 'Identificador de la factura' })
  @ApiOperation({ summary: 'Anula una factura emitida con saldo; solo owner del emisor (§11.5, P4)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Factura anulada (204)' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Rol insuficiente o no es el emisor (403)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Borrador o ya pagada (409)' })
  voidInvoice(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('invId') invId: string,
    @Body() dto: VoidInvoiceDto,
  ): Promise<void> {
    return this.billingService.voidInvoice(access, auth, invId, dto);
  }

  // =========================================================================
  // §4.2 Payments
  // =========================================================================

  @Post('companies/:id/invoices/:invId/payments')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'invId', description: 'Identificador de la factura' })
  @ApiOperation({ summary: 'Registra pago o devolución; posible duplicado queda en sospecha (§11.1, D6, P5)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Pago registrado o posible duplicado' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Borrador, anulada u orden sin saldo (409)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Factura ajena (404)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Importe, fecha o saldo inválidos (422)' })
  registerPayment(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('invId') invId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.billingService.registerPayment(access, auth, invId, dto);
  }

  @Post('companies/:id/payments/:paymentId/reconcile')
  @UseGuards(CompanyAccessGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'paymentId', description: 'Identificador del pago' })
  @ApiOperation({ summary: 'Resuelve un posible duplicado: same o distinct (§11.1, D6)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Conciliado (204)' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'No es un posible duplicado pendiente (409)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Pago ajeno (404)' })
  reconcile(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('paymentId') paymentId: string,
    @Body() dto: ReconcilePaymentDto,
  ): Promise<void> {
    return this.billingService.reconcilePayment(access, auth, paymentId, dto);
  }

  // =========================================================================
  // §4.3 Accounting exports (§3.5, §16.10)
  // =========================================================================

  @Get('companies/:id/accounting-exports')
  @UseGuards(CompanyAccessGuard)
  @ApiOperation({ summary: 'Registros contables propios en PDF o Excel (§3.5, §16.10)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Archivo descargable; audit accounting.exported' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Filtros inválidos (422)' })
  async export(
    @CurrentCompany() access: CompanyAccess,
    @Query() query: AccountingExportQueryDto,
  ): Promise<StreamableFile> {
    const { buffer, contentType, filename } = await this.billingService.exportAccounting(access, query);
    return new StreamableFile(buffer, { type: contentType, disposition: `attachment; filename="${filename}"` });
  }

  // =========================================================================
  // §4.4 Limited-access accounts: read-only invoices of the client (P3, D13)
  // =========================================================================

  @Public()
  @UseGuards(LimitedAccessGuard)
  @Get('limited/:token/invoices')
  @ApiParam({ name: 'token', description: 'Token opaco de acceso limitado' })
  @ApiOperation({ summary: 'Facturas emitidas al cliente propio, solo lectura (P3, D13)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Facturas del tenant (sin borradores)' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token inválido, revocado o expirado (401)' })
  listLimited(@CurrentLimited() limited: LimitedAccess) {
    return this.billingService.listLimitedInvoices(limited.tenantId);
  }

  @Public()
  @UseGuards(LimitedAccessGuard)
  @Get('limited/:token/invoices/:invId')
  @ApiParam({ name: 'token', description: 'Token opaco de acceso limitado' })
  @ApiParam({ name: 'invId', description: 'Identificador de la factura' })
  @ApiOperation({ summary: 'Detalle de una factura del cliente (renglones, pagos, saldo)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Factura del tenant' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token inválido (401)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Factura de otro tenant o borrador (404)' })
  getLimited(@CurrentLimited() limited: LimitedAccess, @Param('invId') invId: string) {
    return this.billingService.getLimitedInvoice(limited.tenantId, invId);
  }

  @Public()
  @UseGuards(LimitedAccessGuard)
  @Get('limited/:token/invoices/:invId/pdf')
  @ApiParam({ name: 'token', description: 'Token opaco de acceso limitado' })
  @ApiParam({ name: 'invId', description: 'Identificador de la factura' })
  @ApiOperation({ summary: 'PDF de la factura del cliente (§11.1, §11.6)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'application/pdf' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token inválido (401)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Factura de otro tenant o borrador (404)' })
  async pdfLimited(
    @CurrentLimited() limited: LimitedAccess,
    @Param('invId') invId: string,
  ): Promise<StreamableFile> {
    const { buffer, contentType, filename } = await this.billingService.getLimitedPdf(limited.tenantId, invId);
    return new StreamableFile(buffer, { type: contentType, disposition: `attachment; filename="${filename}"` });
  }
}
