-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'voided');

-- CreateEnum
CREATE TYPE "InvoiceLineKind" AS ENUM ('material', 'labor', 'tool_rental', 'travel', 'other');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('charge', 'refund');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('recorded', 'duplicate_suspect', 'duplicate_confirmed');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'check', 'transfer', 'card', 'other');

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "recipient_company_id" UUID,
    "recipient_tenant_id" UUID,
    "order_id" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "number" INTEGER,
    "issue_date" DATE,
    "due_date" DATE,
    "subtotal" DECIMAL(12,2),
    "total" DECIMAL(12,2),
    "notes" TEXT,
    "voided_at" TIMESTAMPTZ,
    "void_reason" TEXT,
    "voided_by" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
    -- Exactly one recipient (spec etapa-5 §2.2, proyect.md §11.3)
    CONSTRAINT "invoices_one_recipient_check" CHECK (num_nonnulls("recipient_company_id", "recipient_tenant_id") = 1)
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "kind" "InvoiceLineKind" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_lines_amount_check" CHECK ("amount" >= 0)
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "kind" "PaymentKind" NOT NULL DEFAULT 'charge',
    "status" "PaymentStatus" NOT NULL DEFAULT 'recorded',
    "duplicate_of_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "paid_at" DATE NOT NULL,
    "method" "PaymentMethod",
    "reference" TEXT,
    "notes" TEXT,
    "reconciled_by_user_id" UUID,
    "reconciled_at" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_amount_check" CHECK ("amount" > 0)
);

-- CreateTable
CREATE TABLE "invoice_counters" (
    "company_id" UUID NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("company_id")
);

-- CreateIndex
CREATE INDEX "invoices_company_id_idx" ON "invoices"("company_id");

-- CreateIndex
CREATE INDEX "invoices_recipient_company_id_idx" ON "invoices"("recipient_company_id");

-- CreateIndex
CREATE INDEX "invoices_recipient_tenant_id_idx" ON "invoices"("recipient_tenant_id");

-- CreateIndex
CREATE INDEX "invoices_order_id_idx" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_company_id_number_key" ON "invoices"("company_id", "number");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_lines_job_id_idx" ON "invoice_lines"("job_id");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_company_id_idx" ON "payments"("company_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recipient_company_id_fkey" FOREIGN KEY ("recipient_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recipient_tenant_id_fkey" FOREIGN KEY ("recipient_tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reconciled_by_user_id_fkey" FOREIGN KEY ("reconciled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
