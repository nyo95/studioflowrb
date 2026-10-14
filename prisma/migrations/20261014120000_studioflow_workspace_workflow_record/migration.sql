-- What a phase step wrote into the Workspace (the client answer, a site visit) is the record of that step: its origin
-- and its phase/round labels never change afterwards. Existing rows are marked by how those steps wrote them.
ALTER TABLE "studioflow"."sf_workspace_card" ADD COLUMN "workflow_record" BOOLEAN NOT NULL DEFAULT false;

-- Only the supervision visit step writes a site-visit element.
UPDATE "studioflow"."sf_workspace_card" SET "workflow_record" = true WHERE "origin" = 'SITE_VISIT';

-- The client-answer step writes its feedback in the same transaction that records the answer, labelled with the
-- answered iteration; the answer dialog adds what follows (more text, screenshots) within moments (two minutes is the window).
UPDATE "studioflow"."sf_workspace_card" card
SET "workflow_record" = true
FROM "studioflow"."sf_revision" iteration
WHERE card."origin" = 'CLIENT_ANSWER'
  AND card."iteration_id" = iteration."id"
  AND iteration."answered_at" IS NOT NULL
  AND card."created_at" BETWEEN iteration."answered_at" - interval '5 seconds' AND iteration."answered_at" + interval '2 minutes';
