/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `tenants` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_originator_id_fkey";

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "originator_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_email_key" ON "tenants"("email");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_originator_id_fkey" FOREIGN KEY ("originator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
