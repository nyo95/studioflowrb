import assert from "node:assert/strict";
import { it } from "node:test";

import { createStudioFlowService } from "../service";

it("keeps the StudioFlow phase service surface unchanged", () => {
  const studioFlow = createStudioFlowService({} as never, {} as never);

  assert.deepEqual(Object.keys(studioFlow.phases).sort(), [
    "addIteration", "addPhaseNoteImage", "bypassPhase", "capabilities", "chooseIterationOutcome",
    "chooseSupervisionVisit", "createPhaseDefinition", "createPhaseTemplate", "createSupervisionVisit",
    "deleteDeliverable", "deleteNeverSentIteration", "deletePhaseDefinition", "deletePhaseTemplate",
    "dismissRequirement", "extendDeliverableExpiry", "getPhaseDetail", "getProjectCompletionReadiness",
    "latestUndoableEvent", "listDeliverables", "listNavPhases", "listPhaseTemplates", "listStarredPhaseNotes",
    "listProjectPhases", "markProjectCompleted", "overrideRevision", "recordClientAnswer", "removePhaseNoteImage", "postPhaseNote", "editPhaseNote", "deletePhaseNote",
    "renameIteration", "reopenProject", "reorderPhaseDefinitions", "sendIteration", "setDeliverableFinal",
    "setPhaseNoteFlags", "setPhasePlannedDates", "sweepDeliverableExpiry", "undoPhaseEvent",
    "updatePhaseDefinition", "updatePhaseTemplate", "uploadDeliverable", "uploadDeliverableStream",
  ].sort());
});
