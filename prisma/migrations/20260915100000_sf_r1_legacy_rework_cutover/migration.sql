-- SF-R1 — StudioFlow legacy rework cutover (STUDIOFLOW-REWORK-CONTRACT.md).
--
-- DESTRUCTIVE for the "studioflow" schema only. Owner-authorized 2026-09-15
-- (RW-03): the rebuild StudioFlow R7.xx-R8.69 is archived by git tag
-- archive/studioflow-rb-r8.69 and its rows are discarded, not migrated.
-- Apply only to rebuild databases. No platform, master_data, or bq table is
-- dropped or altered; only StudioFlow grant identifiers are remapped.

DROP SCHEMA IF EXISTS "studioflow" CASCADE;
CREATE SCHEMA "studioflow";

-- ── Enums ─────────────────────────────────────────────────────────────────

CREATE TYPE "studioflow"."sf_project_status" AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED');
CREATE TYPE "studioflow"."sf_project_priority" AS ENUM ('URGENT', 'NORMAL', 'LOW');
CREATE TYPE "studioflow"."sf_phase_key" AS ENUM ('MOODBOARD', 'LAYOUT', 'DESIGN_3D', 'CD', 'SUPERVISION');
CREATE TYPE "studioflow"."sf_phase_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'ON_REVIEW_INTERNAL', 'APPROVED_INTERNAL', 'ON_REVIEW_CLIENT', 'READY_FOR_NEXT', 'COMPLETED');
CREATE TYPE "studioflow"."sf_revision_status" AS ENUM ('ACTIVE', 'COMPLETED');
CREATE TYPE "studioflow"."sf_activity_mode" AS ENUM ('TODO', 'FEEDBACK');
CREATE TYPE "studioflow"."sf_activity_status" AS ENUM ('OPEN', 'COMPLETED');

-- ── Settings and naming sequence ─────────────────────────────────────────

CREATE TABLE "studioflow"."sf_settings" (
  "id" TEXT NOT NULL DEFAULT 'studio',
  "auto_naming_enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by_id" TEXT,
  CONSTRAINT "sf_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "studioflow"."sf_project_sequence" (
  "year" INTEGER NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "sf_project_sequence_pkey" PRIMARY KEY ("year")
);

-- ── Client and project ────────────────────────────────────────────────────

CREATE TABLE "studioflow"."sf_client" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "name_key" TEXT NOT NULL,
  "address" TEXT,
  "logo_storage_key" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "sf_client_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sf_client_name_key_key" ON "studioflow"."sf_client"("name_key");

CREATE TABLE "studioflow"."sf_project" (
  "id" TEXT NOT NULL,
  "project_code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "client_id" TEXT,
  "pic_designer_id" TEXT NOT NULL,
  "pic_drafter_id" TEXT NOT NULL,
  "opening_date" DATE,
  "project_type" TEXT NOT NULL DEFAULT 'RETAIL',
  "status" "studioflow"."sf_project_status" NOT NULL DEFAULT 'ACTIVE',
  "priority" "studioflow"."sf_project_priority" NOT NULL DEFAULT 'NORMAL',
  "client_contact" TEXT,
  "address" TEXT,
  "area" DECIMAL(12,2),
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3),
  "archived_by_id" TEXT,
  "archive_reason" TEXT,
  CONSTRAINT "sf_project_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sf_project_project_code_key" ON "studioflow"."sf_project"("project_code");
CREATE UNIQUE INDEX "sf_project_name_key" ON "studioflow"."sf_project"("name");
CREATE INDEX "sf_project_status_archived_at_idx" ON "studioflow"."sf_project"("status", "archived_at");
CREATE INDEX "sf_project_pic_designer_id_idx" ON "studioflow"."sf_project"("pic_designer_id");
CREATE INDEX "sf_project_pic_drafter_id_idx" ON "studioflow"."sf_project"("pic_drafter_id");
CREATE INDEX "sf_project_client_id_idx" ON "studioflow"."sf_project"("client_id");
ALTER TABLE "studioflow"."sf_project" ADD CONSTRAINT "sf_project_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "studioflow"."sf_client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_project" ADD CONSTRAINT "sf_project_area_check" CHECK ("area" IS NULL OR "area" >= 0);

-- ── Phase and revision ────────────────────────────────────────────────────

CREATE TABLE "studioflow"."sf_phase" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "key" "studioflow"."sf_phase_key" NOT NULL,
  "order_index" INTEGER NOT NULL,
  "status" "studioflow"."sf_phase_status" NOT NULL DEFAULT 'PENDING',
  "is_locked" BOOLEAN NOT NULL DEFAULT false,
  "allow_parallel" BOOLEAN NOT NULL DEFAULT false,
  "status_changed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_phase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sf_phase_project_id_key_key" ON "studioflow"."sf_phase"("project_id", "key");
CREATE UNIQUE INDEX "sf_phase_project_id_order_index_key" ON "studioflow"."sf_phase"("project_id", "order_index");
ALTER TABLE "studioflow"."sf_phase" ADD CONSTRAINT "sf_phase_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "studioflow"."sf_revision" (
  "id" TEXT NOT NULL,
  "phase_id" TEXT NOT NULL,
  "major" INTEGER NOT NULL DEFAULT 1,
  "minor" INTEGER NOT NULL DEFAULT 0,
  "status" "studioflow"."sf_revision_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  CONSTRAINT "sf_revision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sf_revision_version_check" CHECK ("major" >= 0 AND "minor" >= 0)
);
CREATE INDEX "sf_revision_phase_id_status_idx" ON "studioflow"."sf_revision"("phase_id", "status");
-- Contract §5.4: at most one ACTIVE revision per phase.
CREATE UNIQUE INDEX "sf_revision_one_active_per_phase" ON "studioflow"."sf_revision"("phase_id") WHERE "status" = 'ACTIVE';
ALTER TABLE "studioflow"."sf_revision" ADD CONSTRAINT "sf_revision_phase_id_fkey"
  FOREIGN KEY ("phase_id") REFERENCES "studioflow"."sf_phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Activity ──────────────────────────────────────────────────────────────

CREATE TABLE "studioflow"."sf_activity" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "phase_id" TEXT,
  "revision_id" TEXT,
  "content" TEXT NOT NULL,
  "mode" "studioflow"."sf_activity_mode" NOT NULL DEFAULT 'TODO',
  "status" "studioflow"."sf_activity_status" NOT NULL DEFAULT 'OPEN',
  "assigned_to_id" TEXT,
  "deferred_from_version" TEXT,
  "due_at" DATE,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "sf_activity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sf_activity_project_id_status_idx" ON "studioflow"."sf_activity"("project_id", "status");
CREATE INDEX "sf_activity_phase_id_revision_id_status_idx" ON "studioflow"."sf_activity"("phase_id", "revision_id", "status");
CREATE INDEX "sf_activity_assigned_to_id_status_idx" ON "studioflow"."sf_activity"("assigned_to_id", "status");
ALTER TABLE "studioflow"."sf_activity" ADD CONSTRAINT "sf_activity_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_activity" ADD CONSTRAINT "sf_activity_phase_id_fkey"
  FOREIGN KEY ("phase_id") REFERENCES "studioflow"."sf_phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_activity" ADD CONSTRAINT "sf_activity_revision_id_fkey"
  FOREIGN KEY ("revision_id") REFERENCES "studioflow"."sf_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Checklist ─────────────────────────────────────────────────────────────

CREATE TABLE "studioflow"."sf_checklist_template" (
  "id" TEXT NOT NULL,
  "phase_key" "studioflow"."sf_phase_key",
  "label" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_checklist_template_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sf_checklist_template_phase_key_is_active_sort_order_idx" ON "studioflow"."sf_checklist_template"("phase_key", "is_active", "sort_order");

CREATE TABLE "studioflow"."sf_checklist_item" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "phase_id" TEXT,
  "parent_id" TEXT,
  "label" TEXT NOT NULL,
  "is_checked" BOOLEAN NOT NULL DEFAULT false,
  "checked_at" TIMESTAMP(3),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "priority" INTEGER NOT NULL DEFAULT 4,
  "due_at" DATE,
  "assigned_to_id" TEXT,
  "template_id" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_checklist_item_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sf_checklist_item_priority_check" CHECK ("priority" BETWEEN 1 AND 4)
);
CREATE INDEX "sf_checklist_item_project_id_phase_id_parent_id_idx" ON "studioflow"."sf_checklist_item"("project_id", "phase_id", "parent_id");
CREATE INDEX "sf_checklist_item_phase_id_is_checked_idx" ON "studioflow"."sf_checklist_item"("phase_id", "is_checked");
CREATE INDEX "sf_checklist_item_assigned_to_id_is_checked_idx" ON "studioflow"."sf_checklist_item"("assigned_to_id", "is_checked");
ALTER TABLE "studioflow"."sf_checklist_item" ADD CONSTRAINT "sf_checklist_item_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_checklist_item" ADD CONSTRAINT "sf_checklist_item_phase_id_fkey"
  FOREIGN KEY ("phase_id") REFERENCES "studioflow"."sf_phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_checklist_item" ADD CONSTRAINT "sf_checklist_item_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "studioflow"."sf_checklist_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_checklist_item" ADD CONSTRAINT "sf_checklist_item_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "studioflow"."sf_checklist_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "studioflow"."sf_checklist_label" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT 'neutral',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sf_checklist_label_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sf_checklist_label_name_key" ON "studioflow"."sf_checklist_label"("name");

CREATE TABLE "studioflow"."sf_checklist_item_label" (
  "item_id" TEXT NOT NULL,
  "label_id" TEXT NOT NULL,
  CONSTRAINT "sf_checklist_item_label_pkey" PRIMARY KEY ("item_id", "label_id")
);
CREATE INDEX "sf_checklist_item_label_label_id_idx" ON "studioflow"."sf_checklist_item_label"("label_id");
ALTER TABLE "studioflow"."sf_checklist_item_label" ADD CONSTRAINT "sf_checklist_item_label_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "studioflow"."sf_checklist_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_checklist_item_label" ADD CONSTRAINT "sf_checklist_item_label_label_id_fkey"
  FOREIGN KEY ("label_id") REFERENCES "studioflow"."sf_checklist_label"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "studioflow"."sf_checklist_filter_view" (
  "id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "query_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_checklist_filter_view_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sf_checklist_filter_view_owner_id_name_key" ON "studioflow"."sf_checklist_filter_view"("owner_id", "name");

-- ── Grant vocabulary remap (contract §3) ─────────────────────────────────
-- Existing role grants keep equivalent meaning; retired identifiers are removed.

INSERT INTO "platform"."RolePermission" ("id", "role_id", "permission_id", "granted_at")
SELECT md5(rp."role_id" || ':' || m.new_id)::uuid, rp."role_id", m.new_id, CURRENT_TIMESTAMP
FROM "platform"."RolePermission" rp
JOIN (VALUES
  ('studioflow.iteration.manage', 'studioflow.phase.work'),
  ('studioflow.iteration.review', 'studioflow.phase.review'),
  ('studioflow.project.manage', 'studioflow.settings.manage')
) AS m(old_id, new_id) ON rp."permission_id" = m.old_id
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

DELETE FROM "platform"."RolePermission"
WHERE "permission_id" LIKE 'studioflow.%'
  AND "permission_id" NOT IN (
    'studioflow.access',
    'studioflow.project.read',
    'studioflow.project.manage',
    'studioflow.phase.work',
    'studioflow.phase.review',
    'studioflow.phase.override',
    'studioflow.task.manage',
    'studioflow.settings.manage',
    'studioflow.mom.manage',
    'studioflow.schedule.manage'
  );

-- The system owner role holds the full StudioFlow vocabulary.
INSERT INTO "platform"."RolePermission" ("id", "role_id", "permission_id", "granted_at")
SELECT md5('system-platform-owner:' || p.id)::uuid, role."id", p.id, CURRENT_TIMESTAMP
FROM "platform"."Role" AS role
CROSS JOIN (VALUES
  ('studioflow.access'), ('studioflow.project.read'), ('studioflow.project.manage'),
  ('studioflow.phase.work'), ('studioflow.phase.review'), ('studioflow.phase.override'),
  ('studioflow.task.manage'), ('studioflow.settings.manage'),
  ('studioflow.mom.manage'), ('studioflow.schedule.manage')
) AS p(id)
WHERE role."code" = 'platform-owner' AND role."is_system" = true
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
