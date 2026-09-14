/*
  Warnings:

  - The primary key for the `Role` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `RolePermission` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Session` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `UserRole` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the `LoginRateLimit` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "studioflow"."sf_requirement_scope" AS ENUM ('GENERAL', 'PHASE');

-- CreateEnum
CREATE TYPE "studioflow"."sf_requirement_satisfaction_state" AS ENUM ('OPEN', 'SATISFIED');

-- DropForeignKey
ALTER TABLE "platform"."RolePermission" DROP CONSTRAINT "RolePermission_role_id_fkey";

-- DropForeignKey
ALTER TABLE "platform"."Session" DROP CONSTRAINT "Session_user_id_fkey";

-- DropForeignKey
ALTER TABLE "platform"."UserRole" DROP CONSTRAINT "UserRole_role_id_fkey";

-- DropForeignKey
ALTER TABLE "platform"."UserRole" DROP CONSTRAINT "UserRole_user_id_fkey";

-- DropForeignKey
ALTER TABLE "studioflow"."sf_file" DROP CONSTRAINT "sf_file_project_fkey";

-- DropForeignKey
ALTER TABLE "studioflow"."sf_file" DROP CONSTRAINT "sf_file_sent_in_iteration_fkey";

-- DropForeignKey
ALTER TABLE "studioflow"."sf_internal_approval" DROP CONSTRAINT "sf_internal_approval_iteration_fkey";

-- DropForeignKey
ALTER TABLE "studioflow"."sf_iteration" DROP CONSTRAINT "sf_iteration_phase_id_fkey";

-- DropForeignKey
ALTER TABLE "studioflow"."sf_iteration_point" DROP CONSTRAINT "sf_iteration_point_iteration_fkey";

-- DropForeignKey
ALTER TABLE "studioflow"."sf_project" DROP CONSTRAINT "sf_project_client_fk";

-- DropForeignKey
ALTER TABLE "studioflow"."sf_project_phase" DROP CONSTRAINT "sf_project_phase_project_fk";

-- DropForeignKey
ALTER TABLE "studioflow"."sf_project_phase" DROP CONSTRAINT "sf_project_phase_template_fk";

-- DropForeignKey
ALTER TABLE "studioflow"."sf_response" DROP CONSTRAINT "sf_response_iteration_fkey";

-- DropForeignKey
ALTER TABLE "studioflow"."sf_response_point" DROP CONSTRAINT "sf_response_point_response_fkey";

-- DropForeignKey
ALTER TABLE "studioflow"."sf_task" DROP CONSTRAINT "sf_task_attachment_file_fk";

-- DropForeignKey
ALTER TABLE "studioflow"."sf_task" DROP CONSTRAINT "sf_task_project_fk";

-- DropIndex
DROP INDEX "bq"."bq_item_section_id_sort_order_idx";

-- DropIndex
DROP INDEX "bq"."bq_item_subsection_id_sort_order_idx";

-- DropIndex
DROP INDEX "bq"."bq_line_item_item_id_sort_order_idx";

-- DropIndex
DROP INDEX "bq"."bq_line_item_sub_object_id_sort_order_idx";

-- DropIndex
DROP INDEX "bq"."bq_section_project_id_sort_order_idx";

-- DropIndex
DROP INDEX "bq"."bq_sub_object_item_id_sort_order_idx";

-- DropIndex
DROP INDEX "bq"."bq_subsection_section_id_sort_order_idx";

-- DropIndex
DROP INDEX "bq"."bq_template_recommendation_template_section_id_idx";

-- DropIndex
DROP INDEX "bq"."bq_template_section_template_id_parent_id_sort_order_idx";

-- AlterTable
ALTER TABLE "platform"."Role" DROP CONSTRAINT "Role_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Role_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "platform"."RolePermission" DROP CONSTRAINT "RolePermission_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "role_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "platform"."Session" DROP CONSTRAINT "Session_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "user_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Session_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "platform"."User" DROP CONSTRAINT "User_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "platform"."UserRole" DROP CONSTRAINT "UserRole_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "user_id" SET DATA TYPE TEXT,
ALTER COLUMN "role_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "studioflow"."sf_file" ALTER COLUMN "file_modified_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "dropped_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "superseded_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "bytes_released_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "studioflow"."sf_internal_approval" ALTER COLUMN "approved_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "studioflow"."sf_iteration" ALTER COLUMN "sent_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "responded_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "voided_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "studioflow"."sf_iteration_point" ALTER COLUMN "withdrawn_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "studioflow"."sf_response" ALTER COLUMN "received_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "studioflow"."sf_studio_settings" ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- DropTable
DROP TABLE "platform"."LoginRateLimit";

-- CreateTable
CREATE TABLE "studioflow"."sf_requirement_template" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" "studioflow"."sf_requirement_scope" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "phase_template_id" TEXT,
    "key_immutable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sf_requirement_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studioflow"."sf_project_requirement" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "phase_id" TEXT,
    "source_template_id" TEXT,
    "template_key_snapshot" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "satisfaction_state" "studioflow"."sf_requirement_satisfaction_state" NOT NULL DEFAULT 'OPEN',
    "satisfied_at" TIMESTAMP(3),
    "satisfied_by_id" TEXT,
    "satisfaction_note" TEXT,
    "deleted_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "archived_by_id" TEXT,
    "archive_reason" TEXT,
    "restored_at" TIMESTAMP(3),
    "restored_by_id" TEXT,
    "restore_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sf_project_requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studioflow"."sf_requirement_evidence" (
    "id" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linked_by_id" TEXT,
    "unlinked_at" TIMESTAMP(3),
    "unlinked_by_id" TEXT,
    "unlink_reason" TEXT,

    CONSTRAINT "sf_requirement_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sf_requirement_template_scope_phase_template_id_deleted_at_idx" ON "studioflow"."sf_requirement_template"("scope", "phase_template_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sf_requirement_template_scope_phase_template_id_key_key" ON "studioflow"."sf_requirement_template"("scope", "phase_template_id", "key");

-- CreateIndex
CREATE INDEX "sf_project_requirement_project_id_satisfaction_state_archiv_idx" ON "studioflow"."sf_project_requirement"("project_id", "satisfaction_state", "archived_at");

-- CreateIndex
CREATE INDEX "sf_project_requirement_project_id_phase_id_idx" ON "studioflow"."sf_project_requirement"("project_id", "phase_id");

-- CreateIndex
CREATE INDEX "sf_project_requirement_source_template_id_idx" ON "studioflow"."sf_project_requirement"("source_template_id");

-- CreateIndex
CREATE INDEX "sf_requirement_evidence_requirement_id_idx" ON "studioflow"."sf_requirement_evidence"("requirement_id");

-- CreateIndex
CREATE INDEX "sf_requirement_evidence_file_id_idx" ON "studioflow"."sf_requirement_evidence"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "sf_requirement_evidence_requirement_id_file_id_key" ON "studioflow"."sf_requirement_evidence"("requirement_id", "file_id");

-- AddForeignKey
ALTER TABLE "platform"."UserRole" ADD CONSTRAINT "UserRole_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."UserRole" ADD CONSTRAINT "UserRole_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "platform"."Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."RolePermission" ADD CONSTRAINT "RolePermission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "platform"."Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."Session" ADD CONSTRAINT "Session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_project" ADD CONSTRAINT "sf_project_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "studioflow"."sf_client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_project_phase" ADD CONSTRAINT "sf_project_phase_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_project_phase" ADD CONSTRAINT "sf_project_phase_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "studioflow"."sf_phase_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_iteration" ADD CONSTRAINT "sf_iteration_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "studioflow"."sf_project_phase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_iteration_point" ADD CONSTRAINT "sf_iteration_point_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "studioflow"."sf_iteration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_internal_approval" ADD CONSTRAINT "sf_internal_approval_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "studioflow"."sf_iteration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_file" ADD CONSTRAINT "sf_file_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_file" ADD CONSTRAINT "sf_file_sent_in_iteration_id_fkey" FOREIGN KEY ("sent_in_iteration_id") REFERENCES "studioflow"."sf_iteration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_task" ADD CONSTRAINT "sf_task_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_task" ADD CONSTRAINT "sf_task_attachment_file_id_fkey" FOREIGN KEY ("attachment_file_id") REFERENCES "studioflow"."sf_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_response" ADD CONSTRAINT "sf_response_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "studioflow"."sf_iteration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_response_point" ADD CONSTRAINT "sf_response_point_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "studioflow"."sf_response"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_requirement_template" ADD CONSTRAINT "sf_requirement_template_phase_template_id_fkey" FOREIGN KEY ("phase_template_id") REFERENCES "studioflow"."sf_phase_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_project_requirement" ADD CONSTRAINT "sf_project_requirement_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_project_requirement" ADD CONSTRAINT "sf_project_requirement_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "studioflow"."sf_project_phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_project_requirement" ADD CONSTRAINT "sf_project_requirement_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "studioflow"."sf_requirement_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_requirement_evidence" ADD CONSTRAINT "sf_requirement_evidence_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "studioflow"."sf_project_requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studioflow"."sf_requirement_evidence" ADD CONSTRAINT "sf_requirement_evidence_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "studioflow"."sf_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "studioflow"."sf_file_project_folder_idx" RENAME TO "sf_file_project_id_folder_key_idx";

-- RenameIndex
ALTER INDEX "studioflow"."sf_file_project_superseded_at_idx" RENAME TO "sf_file_project_id_superseded_at_idx";

-- RenameIndex
ALTER INDEX "studioflow"."sf_file_sent_in_iteration_idx" RENAME TO "sf_file_sent_in_iteration_id_idx";

-- RenameIndex
ALTER INDEX "studioflow"."sf_internal_approval_iteration_key" RENAME TO "sf_internal_approval_iteration_id_key";

-- RenameIndex
ALTER INDEX "studioflow"."sf_iteration_phase_number_key" RENAME TO "sf_iteration_phase_id_number_key";

-- RenameIndex
ALTER INDEX "studioflow"."sf_iteration_point_iteration_source_idx" RENAME TO "sf_iteration_point_iteration_id_source_idx";

-- RenameIndex
ALTER INDEX "studioflow"."sf_product_catalogue_deleted_sort_idx" RENAME TO "sf_product_catalogue_deleted_at_sort_order_idx";

-- RenameIndex
ALTER INDEX "studioflow"."sf_project_phase_project_sort_idx" RENAME TO "sf_project_phase_project_id_sort_order_idx";

-- RenameIndex
ALTER INDEX "studioflow"."sf_project_phase_unique_key" RENAME TO "sf_project_phase_project_id_key_key";

-- RenameIndex
ALTER INDEX "studioflow"."sf_response_iteration_idx" RENAME TO "sf_response_iteration_id_idx";

-- RenameIndex
ALTER INDEX "studioflow"."sf_response_point_response_idx" RENAME TO "sf_response_point_response_id_idx";

-- RenameIndex
ALTER INDEX "studioflow"."sf_task_assignee_status_created_idx" RENAME TO "sf_task_assignee_id_status_created_at_idx";

-- RenameIndex
ALTER INDEX "studioflow"."sf_task_attachment_file_idx" RENAME TO "sf_task_attachment_file_id_idx";

-- RenameIndex
ALTER INDEX "studioflow"."sf_task_project_status_phase_sort_idx" RENAME TO "sf_task_project_id_status_phase_scope_sort_order_idx";
