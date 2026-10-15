import assert from "node:assert/strict";
import { it } from "node:test";

import { createStudioFlowService } from "../service";

it("keeps the phase service surface explicit, with existing-note mutations on the versioned workspace door", () => {
  const studioFlow = createStudioFlowService({} as never, {} as never);

  assert.deepEqual(Object.keys(studioFlow.phases).sort(), [
    "addIteration", "bypassPhase", "capabilities", "chooseIterationOutcome",
    "chooseSupervisionVisit", "createPhaseDefinition", "createPhaseTemplate", "createSupervisionVisit",
    "deleteDeliverable", "deleteNeverSentIteration", "deletePhaseDefinition", "deletePhaseTemplate",
    "dismissRequirement", "extendDeliverableExpiry", "finishSupervision", "getPhaseDetail", "getProjectCompletionReadiness",
    "latestUndoableEvent", "listDeliverables", "listNavPhases", "listPhaseTemplates", "listStarredPhaseNotes",
    "listProjectPhases", "markProjectCompleted", "overrideRevision", "recordClientAnswer", "postPhaseImage", "postPhaseNote",
    "renameIteration", "reopenProject", "reorderPhaseDefinitions", "sendIteration", "setDeliverableFinal",
    "setPhaseNoteTags", "setPhasePlannedDates", "sweepDeliverableExpiry", "undoPhaseEvent",
    "updatePhaseDefinition", "updatePhaseTemplate", "uploadDeliverable", "uploadDeliverableStream",
  ].sort());
});
