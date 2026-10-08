import { createLibraryService } from "./library/service";
import { createCdListService } from "./cd-list/service";
import { createIdeaService } from "./ideas/service";
import { createMomService } from "./mom/service";
import { STUDIOFLOW_PERMISSIONS } from "./permissions";
import { createPhaseService } from "./phases/service";
import { createPresentationService } from "./presentation/service";
import { createProjectService } from "./projects/service";
import { createScheduleService } from "./schedule/service";
import type { Db, StudioFlowPorts } from "./shared";
import { createTaskService } from "./tasks/service";

/** Composed StudioFlow application service (one module per capability). */
export function createStudioFlowService(db: Db, ports: StudioFlowPorts) {
  const schedule = createScheduleService(db, ports);
  return {
    projects: createProjectService(db, ports),
    cdList: createCdListService(db, ports),
    phases: createPhaseService(db, ports),
    tasks: createTaskService(db, ports),
    mom: createMomService(db, ports),
    schedule,
    ideas: createIdeaService(db, ports, schedule.writer),
    presentation: createPresentationService(db, ports),
    library: createLibraryService(ports),
  };
}

export type StudioFlowService = ReturnType<typeof createStudioFlowService>;
export { STUDIOFLOW_PERMISSIONS };
export type { StudioFlowPorts };
