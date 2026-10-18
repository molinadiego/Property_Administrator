-- CreateEnum
CREATE TYPE "EmergencyPolicy" AS ENUM ('prior_authorization', 'resolve_without_authorization', 'emergency_amount');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('material', 'labor', 'other');

-- CreateEnum
CREATE TYPE "CostReportStatus" AS ENUM ('draft', 'submitted');

-- CreateEnum
CREATE TYPE "AuthorizationRequestType" AS ENUM ('exceed_spending_limit', 'additional_work');

-- CreateEnum
CREATE TYPE "AuthorizationRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "AuthorizationSource" AS ENUM ('platform_request', 'offline');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "default_spending_limit" DECIMAL(12,2),
ADD COLUMN     "emergency_extra_amount" DECIMAL(12,2),
ADD COLUMN     "emergency_policy" "EmergencyPolicy" NOT NULL DEFAULT 'prior_authorization';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "commercial_relation_id" UUID,
ADD COLUMN     "margin_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "margin_percent" DECIMAL(5,2),
ADD COLUMN     "margin_set_at" TIMESTAMPTZ,
ADD COLUMN     "margin_set_by" UUID,
ADD COLUMN     "spending_limit" DECIMAL(12,2),
ADD COLUMN     "spending_limit_set_at" TIMESTAMPTZ,
ADD COLUMN     "spending_limit_set_by" UUID;

-- CreateTable
CREATE TABLE "commercial_relations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "counterparty_company_id" UUID,
    "client_relationship_id" UUID,
    "label" TEXT,
    "emergency_policy" "EmergencyPolicy",
    "emergency_extra_amount" DECIMAL(12,2),
    "ended_at" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commercial_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_reports" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "CostReportStatus" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "total" DECIMAL(12,2),
    "submitted_by" UUID,
    "submitted_at" TIMESTAMPTZ,
    "previous_report_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cost_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_items" (
    "id" UUID NOT NULL,
    "cost_report_id" UUID NOT NULL,
    "category" "CostCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "is_emergency" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cost_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_authorizations" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" "AuthorizationRequestType" NOT NULL,
    "source" "AuthorizationSource" NOT NULL,
    "granted_by_user_id" UUID,
    "granted_by_description" TEXT,
    "granted_at" TIMESTAMPTZ NOT NULL,
    "authorized_by_user_id" UUID NOT NULL,
    "amount_cap" DECIMAL(12,2),
    "description" TEXT NOT NULL,
    "authorization_request_id" UUID,
    "job_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorization_requests" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "requesting_company_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "type" "AuthorizationRequestType" NOT NULL,
    "description" TEXT NOT NULL,
    "requested_amount" DECIMAL(12,2),
    "status" "AuthorizationRequestStatus" NOT NULL DEFAULT 'pending',
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMPTZ,
    "resolution_note" TEXT,
    "authorization_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "authorization_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_relations_company_id_idx" ON "commercial_relations"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_relations_company_id_counterparty_company_id_key" ON "commercial_relations"("company_id", "counterparty_company_id");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_relations_company_id_client_relationship_id_key" ON "commercial_relations"("company_id", "client_relationship_id");

-- CreateIndex
CREATE INDEX "cost_reports_assignment_id_status_idx" ON "cost_reports"("assignment_id", "status");

-- CreateIndex
CREATE INDEX "cost_reports_company_id_idx" ON "cost_reports"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_reports_assignment_id_version_key" ON "cost_reports"("assignment_id", "version");

-- CreateIndex
CREATE INDEX "cost_items_cost_report_id_idx" ON "cost_items"("cost_report_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_authorizations_authorization_request_id_key" ON "order_authorizations"("authorization_request_id");

-- CreateIndex
CREATE INDEX "order_authorizations_order_id_idx" ON "order_authorizations"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "authorization_requests_authorization_id_key" ON "authorization_requests"("authorization_id");

-- CreateIndex
CREATE INDEX "authorization_requests_order_id_status_idx" ON "authorization_requests"("order_id", "status");

-- CreateIndex
CREATE INDEX "authorization_requests_requesting_company_id_idx" ON "authorization_requests"("requesting_company_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_commercial_relation_id_fkey" FOREIGN KEY ("commercial_relation_id") REFERENCES "commercial_relations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_relations" ADD CONSTRAINT "commercial_relations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_relations" ADD CONSTRAINT "commercial_relations_counterparty_company_id_fkey" FOREIGN KEY ("counterparty_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_relations" ADD CONSTRAINT "commercial_relations_client_relationship_id_fkey" FOREIGN KEY ("client_relationship_id") REFERENCES "client_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_relations" ADD CONSTRAINT "commercial_relations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_reports" ADD CONSTRAINT "cost_reports_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_reports" ADD CONSTRAINT "cost_reports_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_reports" ADD CONSTRAINT "cost_reports_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_reports" ADD CONSTRAINT "cost_reports_previous_report_id_fkey" FOREIGN KEY ("previous_report_id") REFERENCES "cost_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_cost_report_id_fkey" FOREIGN KEY ("cost_report_id") REFERENCES "cost_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_authorizations" ADD CONSTRAINT "order_authorizations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_authorizations" ADD CONSTRAINT "order_authorizations_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_authorizations" ADD CONSTRAINT "order_authorizations_authorized_by_user_id_fkey" FOREIGN KEY ("authorized_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_authorizations" ADD CONSTRAINT "order_authorizations_authorization_request_id_fkey" FOREIGN KEY ("authorization_request_id") REFERENCES "authorization_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_authorizations" ADD CONSTRAINT "order_authorizations_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_requests" ADD CONSTRAINT "authorization_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_requests" ADD CONSTRAINT "authorization_requests_requesting_company_id_fkey" FOREIGN KEY ("requesting_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_requests" ADD CONSTRAINT "authorization_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_requests" ADD CONSTRAINT "authorization_requests_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_requests" ADD CONSTRAINT "authorization_requests_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "order_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
