"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { phaseAccentDotClass, phaseStatusDisplay, type PhaseStatus } from "@/apps/studioflow/domain/phase";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  EntityPrimaryCell,
  FilterChip,
  FormattedInstant,
  RowActionsCell,
  RowActionsHead,
  SearchField,
  Select,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
} from "@/platform/ui_engine";

import { PersonChip, type Person } from "../_components/people";
import { NewProjectDialog } from "./new-project-dialog";
import { ProjectRowActions } from "./project-row-actions";

type ProjectRow = {
  id: string;
  name: string;
  readableName: string;
  client: { id: string; name: string } | null;
  status: "ACTIVE" | "ON_HOLD" | "COMPLETED";
  priority: "URGENT" | "NORMAL" | "LOW";
  projectType: string;
  openingDate: string | null;
  timelineStartDate: string;
  clientContact: string | null;
  address: string | null;
  area: string | null;
  archivedAt: Date | null;
  updatedAt: Date;
  designer: Person;
  drafter: Person;
  phases: Array<{ id: string; definitionId: string; status: PhaseStatus; isLocked: boolean; label: string }>;
  openItems: number;
};

const STATUS_OPTIONS = [["ALL", "All"], ["ACTIVE", "Active"], ["ON_HOLD", "On hold"], ["COMPLETED", "Completed"]] as const;

function PhaseDotLabel({ phases }: { phases: ProjectRow["phases"] }) {
  const activePhase = phases.find((p) => {
    const g = phaseStatusDisplay(p.status).group;
    return g !== "Approved" && g !== "Done" && g !== "Not started";
  });
  const lastDone = [...phases].reverse().find((p) => {
    const g = phaseStatusDisplay(p.status).group;
    return g === "Approved" || g === "Done";
  });
  const phase = activePhase ?? lastDone ?? phases[0];
  if (!phase) return <span className="text-sm text-ink-3">—</span>;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className={`size-2 shrink-0 rounded-full ${phaseAccentDotClass(phase.definitionId)}`} aria-hidden="true" />
      <span className="truncate text-sm text-ink-2">{phase.label}</span>
    </div>
  );
}

export function ProjectDirectory({
  projects,
  people,
  clients,
  filters,
  canManage,
  autoNaming,
}: {
  projects: ProjectRow[];
  people: Person[];
  clients: Array<{ id: string; name: string }>;
  filters: { status: string; priority: string; pic: string; client: string; q: string; archived: boolean };
  canManage: boolean;
  autoNaming: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locale, timezone } = useDisplaySettings();
  const [query, setQuery] = useState(filters.q);
  const [creating, setCreating] = useState(false);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="grid gap-3">
      <TableToolbar
        search={
          <form onSubmit={(e) => { e.preventDefault(); setParam("q", query.trim()); }} className="w-full max-w-80">
            <SearchField value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => { setQuery(""); setParam("q", ""); }} placeholder="Search project or client…" />
          </form>
        }
        filters={
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_OPTIONS.map(([value, label]) => (
              <FilterChip key={value} selected={!filters.archived && filters.status === value} onClick={() => { const next = new URLSearchParams(searchParams.toString()); next.delete("view"); value === "ALL" ? next.delete("status") : next.set("status", value); router.replace(`${pathname}?${next}`); }}>{label}</FilterChip>
            ))}
            <FilterChip selected={filters.archived} onClick={() => setParam("view", filters.archived ? "" : "archived")}>Archived</FilterChip>
            <div className="w-40 shrink-0"><Select aria-label="Person in charge" density="compact" value={filters.pic} onChange={(e) => setParam("pic", e.target.value)}>
              <option value="">Anyone</option>
              <option value="me">My projects</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
            </Select></div>
            <div className="w-32 shrink-0"><Select aria-label="Priority" density="compact" value={filters.priority} onChange={(e) => setParam("priority", e.target.value)}>
              <option value="">Any priority</option>
              <option value="URGENT">Urgent</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Low</option>
            </Select></div>
            {clients.length > 0 ? (
              <div className="w-44 shrink-0"><Select aria-label="Client" density="compact" value={filters.client} onChange={(e) => setParam("client", e.target.value)}>
                <option value="">Any client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select></div>
            ) : null}
          </div>
        }
        actions={canManage ? <Button variant="primary" leadingIcon={<Plus aria-hidden="true" />} onClick={() => setCreating(true)}>New project</Button> : undefined}
      />

      <DataTable minWidth={880}>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead className="w-48">Phases</TableHead>
            <TableHead className="w-44">Designer / Drafter</TableHead>
            <TableHead className="w-14" align="end">Open</TableHead>
            <TableHead className="w-28">Updated</TableHead>
            {canManage ? <RowActionsHead /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canManage ? 6 : 5}>
                <EmptyState title={filters.archived ? "No archived projects" : "No projects match"} description={canManage && !filters.archived ? "Create the first project to start its phases." : undefined} action={canManage && !filters.archived ? <Button onClick={() => setCreating(true)}>New project</Button> : undefined} />
              </TableCell>
            </TableRow>
          ) : projects.map((project) => (
            <TableRow key={project.id} className="cursor-pointer" onClick={() => router.push(STUDIOFLOW_ROUTES.project(project.id))}>
              <TableCell>
                <Link href={STUDIOFLOW_ROUTES.project(project.id)} prefetch={false} onClick={(e) => e.stopPropagation()} className="block no-underline">
                  <EntityPrimaryCell
                    tone={project.status === "ACTIVE" ? "success" : project.status === "ON_HOLD" ? "warning" : "neutral"}
                    statusLabel={project.status === "ON_HOLD" ? "On hold" : project.status === "ACTIVE" ? "Active" : "Completed"}
                    name={<>{project.name}{project.priority === "URGENT" ? <Badge tone="danger" className="ml-2">Urgent</Badge> : null}</>}
                    secondary={project.client?.name ?? "No client"}
                  />
                </Link>
              </TableCell>
              <TableCell className="w-48">
                <PhaseDotLabel phases={project.phases} />
              </TableCell>
              <TableCell>
                <div className="grid gap-1">
                  <PersonChip person={project.designer} />
                  <PersonChip person={project.drafter} />
                </div>
              </TableCell>
              <TableCell align="end"><span className="tabular-nums">{project.openItems}</span></TableCell>
              <TableCell className="tabular-nums"><FormattedInstant value={project.updatedAt} locale={locale} timeZone={timezone} /></TableCell>
              {canManage ? (
                <RowActionsCell>
                  <span onClick={(e) => e.stopPropagation()}>
                    <ProjectRowActions project={project} people={people} clients={clients} />
                  </span>
                </RowActionsCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </DataTable>

      {creating ? <NewProjectDialog people={people} clients={clients} autoNaming={autoNaming} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
