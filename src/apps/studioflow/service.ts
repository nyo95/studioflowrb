import { createMomService } from "./mom/service";
import { STUDIOFLOW_PERMISSIONS } from "./permissions";
import { createPhaseService } from "./phases/service";
import { createProjectService } from "./projects/service";
import type { Db, StudioFlowPorts } from "./shared";
import { createTaskService } from "./tasks/service";
import { createTodayService } from "./today/service";

/** Composed StudioFlow application service (one module per capability). */
export function createStudioFlowService(db: Db, ports: StudioFlowPorts) {
  return {
    projects: createProjectService(db, ports),
    phases: createPhaseService(db, ports),
    tasks: createTaskService(db, ports),
    today: createTodayService(db, ports),
    mom: createMomService(db, ports),
  };
}

export type StudioFlowService = ReturnType<typeof createStudioFlowService>;
export { STUDIOFLOW_PERMISSIONS };
export type { StudioFlowPorts };
