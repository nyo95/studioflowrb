import { createBookFeedbackService } from "./book/feedback-service";
import { createBookTodoService } from "./book/todo-service";
import { createLibraryService } from "./library/service";
import { createCdListService } from "./cd-list/service";
import { createMomService } from "./mom/service";
import { STUDIOFLOW_PERMISSIONS } from "./permissions";
import { createPhaseService } from "./phases/service";
import { createProjectService } from "./projects/service";
import { createScheduleService } from "./schedule/service";
import type { Db, StudioFlowPorts } from "./shared";
import { createTaskService } from "./tasks/service";
import { createWorkspaceService } from "./workspace/service";
import { createDocumentIdentityService } from "./document-identity";

/** Composed StudioFlow application service (one module per capability). */
export function createStudioFlowService(db: Db, ports: StudioFlowPorts) {
  const schedule = createScheduleService(db, ports);
  const phases = createPhaseService(db, ports);
  return {
    projects: createProjectService(db, ports),
    cdList: createCdListService(db, ports),
    phases,
    workspace: createWorkspaceService(db, ports).workspace,
    bookTodos: createBookTodoService(db, ports),
    bookFeedback: createBookFeedbackService(db, ports, phases.answerIterationInTx),
    tasks: createTaskService(db, ports),
    mom: createMomService(db, ports),
    schedule,
    library: createLibraryService(ports),
    documentIdentity: createDocumentIdentityService(db, ports),
  };
}

export type StudioFlowService = ReturnType<typeof createStudioFlowService>;
export { STUDIOFLOW_PERMISSIONS };
export type { StudioFlowPorts };
