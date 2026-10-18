-- CreateEnum
CREATE TYPE "JobEventType" AS ENUM ('progress_note', 'started', 'completed', 'incomplete', 'resumed', 'not_realized');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('photo', 'document');

-- CreateEnum
CREATE TYPE "FileTargetType" AS ENUM ('order', 'job');

-- AlterEnum
ALTER TYPE "AssignmentStatus" ADD VALUE 'revoked';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobStatus" ADD VALUE 'accepted';
ALTER TYPE "JobStatus" ADD VALUE 'incomplete';

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'in_progress';

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "completed_at" TIMESTAMPTZ,
ADD COLUMN     "started_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMPTZ,
ADD COLUMN     "cancelled_by" UUID,
ADD COLUMN     "closed_at" TIMESTAMPTZ,
ADD COLUMN     "closed_by" UUID;

-- CreateTable
CREATE TABLE "job_events" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "type" "JobEventType" NOT NULL,
    "message" TEXT,
    "actor_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_objects" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "target_type" "FileTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "kind" "FileKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history_shares" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "shared_with_membership_id" UUID NOT NULL,
    "shared_by" UUID NOT NULL,
    "note" TEXT,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "history_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_events_job_id_created_at_idx" ON "job_events"("job_id", "created_at");

-- CreateIndex
CREATE INDEX "job_events_company_id_idx" ON "job_events"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_objects_storage_key_key" ON "file_objects"("storage_key");

-- CreateIndex
CREATE INDEX "file_objects_order_id_idx" ON "file_objects"("order_id");

-- CreateIndex
CREATE INDEX "file_objects_target_type_target_id_idx" ON "file_objects"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "file_objects_company_id_created_at_idx" ON "file_objects"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "history_shares_property_id_shared_with_membership_id_idx" ON "history_shares"("property_id", "shared_with_membership_id");

-- CreateIndex
CREATE INDEX "history_shares_company_id_idx" ON "history_shares"("company_id");

-- CreateIndex
CREATE INDEX "jobs_order_id_status_idx" ON "jobs"("order_id", "status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_shares" ADD CONSTRAINT "history_shares_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_shares" ADD CONSTRAINT "history_shares_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_shares" ADD CONSTRAINT "history_shares_shared_with_membership_id_fkey" FOREIGN KEY ("shared_with_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_shares" ADD CONSTRAINT "history_shares_shared_by_fkey" FOREIGN KEY ("shared_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
