import { createSampleRequestCoordinator } from "@/application/sample-request-coordinator";
import { masterDataPublicCommands } from "@/apps/masterdata/runtime";
import { studioFlowSampleRequestRead, studioFlowSampleRequestCommand } from "@/apps/studioflow/runtime";

/** Shell wiring: each app's own contract goes in, neither app imports the other. */
export const sampleRequestCoordinator = createSampleRequestCoordinator({
  studioFlow: { ...studioFlowSampleRequestRead, ...studioFlowSampleRequestCommand },
  masterData: masterDataPublicCommands,
});
