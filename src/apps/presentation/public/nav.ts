export const PRESENTATION_ROUTES = Object.freeze({
  project: (projectId: string) => `/studioflow/projects/${projectId}/presentation`,
  board: (projectId: string, boardId: string) => `/studioflow/projects/${projectId}/presentation/${boardId}`,
  print: (projectId: string, boardId: string) => `/studioflow/print/projects/${projectId}/presentation/${boardId}`,
});
