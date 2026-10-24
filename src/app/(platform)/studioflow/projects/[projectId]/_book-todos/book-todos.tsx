import { studioFlow } from "@/apps/studioflow/runtime";

import { bookDateDisplaySettings } from "../../../_components/book-today";
import { pageProjectAccess, pageSession } from "../../../_components/session";
import { BookTodosPanel } from "./book-todos-panel";

/**
 * The to-do section of the Project book (WO-SF-BOOK-02, DESIGN.md §6.3). Only a book reader gets it: a manager who is
 * not in the book renders nothing, not an empty box.
 */
export async function BookTodos({ projectId, team, archived, status }: {
  projectId: string;
  team: { designer: { id: string; displayName: string }; drafter: { id: string; displayName: string } };
  archived: boolean;
  status: string;
}) {
  const { grants, userId } = await pageSession();
  const access = await pageProjectAccess(projectId);
  if (!access.canReadBook) return null;
  const [todos, members, dateDisplay] = await Promise.all([
    studioFlow.bookTodos.listProjectTodos({ grants, actorId: userId, projectId }),
    studioFlow.workspace.listBookMembers({ grants, actorId: userId, projectId }),
    bookDateDisplaySettings(),
  ]);
  const isPic = access.isDesigner || access.isDrafter;
  // The rule the server applies: an open project; a PIC may also write while it is on hold, a member only when active.
  const canWrite = studioFlow.phases.capabilities(grants).work && !archived && status !== "COMPLETED" && (isPic || status === "ACTIVE");
  const assignees = [
    { id: team.designer.id, name: team.designer.displayName },
    ...(team.drafter.id !== team.designer.id ? [{ id: team.drafter.id, name: team.drafter.displayName }] : []),
    ...members.filter((member) => member.active).map((member) => ({ id: member.userId, name: member.displayName })),
  ];
  return (
    <BookTodosPanel
      projectId={projectId}
      todos={todos.map((todo) => ({ id: todo.id, label: todo.label, assigneeId: todo.assigneeId, assigneeName: todo.assigneeName, dueDate: todo.dueDate, done: todo.doneAt !== null, version: todo.version }))}
      assignees={assignees}
      canWrite={canWrite}
      today={dateDisplay.today}
      locale={dateDisplay.locale}
      currentUserId={userId}
    />
  );
}
