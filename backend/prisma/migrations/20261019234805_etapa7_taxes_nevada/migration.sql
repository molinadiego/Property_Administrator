-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "default_tax_rate" DECIMAL(5,3),
ADD COLUMN     "tax_address" TEXT,
ADD COLUMN     "tax_exempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tax_id" VARCHAR(64);

-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "taxable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "tax_rate" DECIMAL(5,3),
ADD COLUMN     "tax_total" DECIMAL(12,2);

-- Etapa 7 (spec etapa-7.md §2.2, D1/D4): rate bounds, non-negative tax and
-- the frozen-total invariant `total = subtotal + tax_total`.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tax_rate_range"
    CHECK ("tax_rate" IS NULL OR ("tax_rate" >= 0 AND "tax_rate" <= 100));
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tax_total_non_negative"
    CHECK ("tax_total" IS NULL OR "tax_total" >= 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_total_includes_tax"
    CHECK ("tax_total" IS NULL OR "total" = "subtotal" + "tax_total");

ALTER TABLE "companies" ADD CONSTRAINT "companies_default_tax_rate_range"
    CHECK ("default_tax_rate" IS NULL OR ("default_tax_rate" >= 0 AND "default_tax_rate" <= 100));

-- §11.6: invoices emitted before this stage keep their amounts with zero
-- tax; their PDFs must render exactly as before.
UPDATE "invoices" SET "tax_total" = 0.00 WHERE "status" <> 'draft';
