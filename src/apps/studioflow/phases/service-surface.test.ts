import assert from "node:assert/strict";
import { it } from "node:test";

import { createStudioFlowService } from "../service";

it("keeps the StudioFlow phase service surface unchanged", () => {
  const studioFlow = createStudioFlowService({} as never, {} as never);

  assert.deepEqual(Object.keys(studioFlow.phases).sort(), [
    "addIteration", "addIterationImage", "bypassPhase", "capabilities", "chooseIterationOutcome",
    "chooseSupervisionVisit", "createPhaseDefinition", "createPhaseTemplate", "createSupervisionVisit",
    "deleteDeliverable", "deleteNeverSentIteration", "deletePhaseDefinition", "deletePhaseTemplate",
    "dismissRequirement", "extendDeliverableExpiry", "getPhaseDetail", "getProjectCompletionReadiness",
    "latestUndoableEvent", "listDeliverables", "listNavPhases", "listPhaseNotes", "listPhaseTemplates",
    "listProjectPhases", "markProjectCompleted", "overrideRevision", "recordClientAnswer", "removeIterationImage",
    "renameIteration", "reopenProject", "reorderPhaseDefinitions", "sendIteration", "setDeliverableFinal",
    "setIterationNote", "setPhaseNote", "setPhasePlannedDates", "sweepDeliverableExpiry", "undoPhaseEvent",
    "updatePhaseDefinition", "updatePhaseTemplate", "uploadDeliverable", "uploadDeliverableStream",
  ].sort());
});
