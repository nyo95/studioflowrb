-- WO-SF-WORKSPACE-03: persist optional frame/card canvas geometry without changing existing rows.

ALTER TABLE "studioflow"."sf_workspace_section"
  ADD COLUMN "canvas_x" INTEGER,
  ADD COLUMN "canvas_y" INTEGER,
  ADD COLUMN "canvas_w" INTEGER,
  ADD COLUMN "canvas_h" INTEGER,
  ADD CONSTRAINT "sf_workspace_section_canvas_x_range" CHECK ("canvas_x" IS NULL OR ("canvas_x" >= 0 AND "canvas_x" <= 100000)),
  ADD CONSTRAINT "sf_workspace_section_canvas_y_range" CHECK ("canvas_y" IS NULL OR ("canvas_y" >= 0 AND "canvas_y" <= 100000)),
  ADD CONSTRAINT "sf_workspace_section_canvas_w_range" CHECK ("canvas_w" IS NULL OR ("canvas_w" >= 260 AND "canvas_w" <= 100000)),
  ADD CONSTRAINT "sf_workspace_section_canvas_h_range" CHECK ("canvas_h" IS NULL OR ("canvas_h" >= 120 AND "canvas_h" <= 100000)),
  ADD CONSTRAINT "sf_workspace_section_canvas_position_pair" CHECK (("canvas_x" IS NULL) = ("canvas_y" IS NULL));

ALTER TABLE "studioflow"."sf_workspace_card"
  ADD COLUMN "canvas_x" INTEGER,
  ADD COLUMN "canvas_y" INTEGER,
  ADD COLUMN "canvas_w" INTEGER,
  ADD CONSTRAINT "sf_workspace_card_canvas_x_range" CHECK ("canvas_x" IS NULL OR ("canvas_x" >= 0 AND "canvas_x" <= 100000)),
  ADD CONSTRAINT "sf_workspace_card_canvas_y_range" CHECK ("canvas_y" IS NULL OR ("canvas_y" >= 0 AND "canvas_y" <= 100000)),
  ADD CONSTRAINT "sf_workspace_card_canvas_w_range" CHECK ("canvas_w" IS NULL OR ("canvas_w" >= 180 AND "canvas_w" <= 100000)),
  ADD CONSTRAINT "sf_workspace_card_canvas_position_pair" CHECK (("canvas_x" IS NULL) = ("canvas_y" IS NULL));
