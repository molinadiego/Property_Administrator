-- CreateEnum
CREATE TYPE "PropertyOccupancy" AS ENUM ('occupied', 'vacant');

-- CreateEnum
CREATE TYPE "PropertyTenantKind" AS ENUM ('owner', 'tenant');

-- CreateEnum
CREATE TYPE "OrderOrigin" AS ENUM ('management', 'contractor', 'own_business');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('requested', 'open', 'assigned', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'in_progress', 'done', 'not_realized');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('order_created', 'order_assigned', 'assignment_requested', 'assignment_accepted', 'assignment_rejected', 'job_added');

-- CreateEnum
CREATE TYPE "LimitedAccessStatus" AS ENUM ('active', 'revoked', 'expired');

-- AlterEnum
ALTER TYPE "CompanyType" ADD VALUE 'own_business';

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "owner_name" TEXT,
    "owner_phone" TEXT,
    "owner_email" TEXT,
    "owner_address" TEXT,
    "owner_city" TEXT,
    "owner_state" TEXT,
    "owner_postal_code" TEXT,
    "address_line" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postal_code" TEXT,
    "occupancy" "PropertyOccupancy" NOT NULL DEFAULT 'vacant',
    "community_name" TEXT,
    "community_access_code" TEXT,
    "entry_instructions" TEXT,
    "allow_unattended_entry" BOOLEAN NOT NULL DEFAULT false,
    "pets_info" TEXT,
    "other_instructions" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phones" JSONB NOT NULL DEFAULT '[]',
    "address" TEXT,
    "availability" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_tenants" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" "PropertyTenantKind" NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_relationships" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "client_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "origin" "OrderOrigin" NOT NULL,
    "originator_id" UUID NOT NULL,
    "client_relationship_id" UUID,
    "requested_by_tenant_id" UUID,
    "parent_order_id" UUID,
    "access_lockbox" TEXT,
    "access_community_code" TEXT,
    "access_entry_instructions" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "assignee_membership_id" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'pending',
    "assigned_by" UUID NOT NULL,
    "responded_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "link" TEXT,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "limited_access_tokens" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "LimitedAccessStatus" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "limited_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "properties_company_id_idx" ON "properties"("company_id");

-- CreateIndex
CREATE INDEX "properties_company_id_created_at_idx" ON "properties"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "property_tenants_property_id_idx" ON "property_tenants"("property_id");

-- CreateIndex
CREATE INDEX "property_tenants_tenant_id_idx" ON "property_tenants"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_tenants_property_id_tenant_id_key" ON "property_tenants"("property_id", "tenant_id");

-- CreateIndex
CREATE INDEX "client_relationships_company_id_idx" ON "client_relationships"("company_id");

-- CreateIndex
CREATE INDEX "client_relationships_tenant_id_idx" ON "client_relationships"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_relationships_company_id_tenant_id_key" ON "client_relationships"("company_id", "tenant_id");

-- CreateIndex
CREATE INDEX "orders_company_id_created_at_idx" ON "orders"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_property_id_idx" ON "orders"("property_id");

-- CreateIndex
CREATE INDEX "orders_parent_order_id_idx" ON "orders"("parent_order_id");

-- CreateIndex
CREATE INDEX "jobs_order_id_idx" ON "jobs"("order_id");

-- CreateIndex
CREATE INDEX "jobs_company_id_idx" ON "jobs"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_order_id_sort_order_key" ON "jobs"("order_id", "sort_order");

-- CreateIndex
CREATE INDEX "assignments_job_id_idx" ON "assignments"("job_id");

-- CreateIndex
CREATE INDEX "assignments_company_id_idx" ON "assignments"("company_id");

-- CreateIndex
CREATE INDEX "assignments_assignee_membership_id_idx" ON "assignments"("assignee_membership_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "limited_access_tokens_token_hash_key" ON "limited_access_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "limited_access_tokens_tenant_id_idx" ON "limited_access_tokens"("tenant_id");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_tenants" ADD CONSTRAINT "property_tenants_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_tenants" ADD CONSTRAINT "property_tenants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_relationships" ADD CONSTRAINT "client_relationships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_relationships" ADD CONSTRAINT "client_relationships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_originator_id_fkey" FOREIGN KEY ("originator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_relationship_id_fkey" FOREIGN KEY ("client_relationship_id") REFERENCES "client_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_requested_by_tenant_id_fkey" FOREIGN KEY ("requested_by_tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_parent_order_id_fkey" FOREIGN KEY ("parent_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assignee_membership_id_fkey" FOREIGN KEY ("assignee_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "limited_access_tokens" ADD CONSTRAINT "limited_access_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
