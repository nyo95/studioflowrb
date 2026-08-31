"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, Filter, LayoutGrid, PanelLeftClose, PanelLeftOpen, Sparkles, Trash2 } from "lucide-react";

import {
  AppShell,
  Badge,
  Button,
  Combobox,
  ConfirmDialog,
  CreatableSearch,
  DataTable,
  DescriptionItem,
  DescriptionList,
  Dialog,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  FormActions,
  FormSection,
  Heading,
  IconButton,
  InlineError,
  Input,
  LoadingState,
  NavItem,
  Notice,
  PageHeader,
  PageSection,
  PageShell,
  Pagination,
  RadioGroup,
  RowActionMenu,
  SearchField,
  SectionCard,
  Select,
  SelectionBar,
  Skeleton,
  Spinner,
  StatusBadge,
  Surface,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Text,
  Textarea,
  Tabs,
  useConfirm,
  useDebouncedValue,
  useOptionOverlay,
  useUnsavedChangesGuard,
} from "@/platform/ui_engine";

type ShowcaseRow = {
  id: string;
  code: string;
  name: string;
  status: "draft" | "active" | "archived";
  owner: string;
  amount: string;
  notes: string;
};

const ROWS: ShowcaseRow[] = [
  { id: "r1", code: "BRD-001", name: "Arbor Linen", status: "active", owner: "Nadia", amount: "18.000", notes: "Primary supplier price" },
  { id: "r2", code: "BRD-002", name: "Tide Ash", status: "draft", owner: "Bima", amount: "12.500", notes: "Pending supplier review" },
  { id: "r3", code: "BRD-003", name: "Hearth Clay", status: "active", owner: "Maya", amount: "24.750", notes: "Featured material" },
  { id: "r4", code: "BRD-004", name: "North Reed", status: "archived", owner: "Ari", amount: "9.900", notes: "Archived row for review" },
];

const COMBO_OPTIONS = [
  { id: "all", label: "All records", description: "Shows every row in the showcase" },
  { id: "active", label: "Active", description: "Only published rows" },
  { id: "draft", label: "Draft", description: "Rows still being edited" },
  { id: "archived", label: "Archived", description: "Retired rows", disabled: false },
] as const;

export function UiEngineShowcase() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 140);
  const [statusFilter, setStatusFilter] = useState<"all" | ShowcaseRow["status"]>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>(["r1"]);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedCombo, setSelectedCombo] = useState("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastAction, setLastAction] = useState<string>("Ready.");
  const [note, setNote] = useState("This note starts dirty only after editing.");
  const [selectedTag, setSelectedTag] = useState("studioflow");
  const [statusQuery, setStatusQuery] = useState("");
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<ShowcaseRow | null>(null);
  const confirm = useConfirm();

  const tagOverlay = useOptionOverlay([
    { id: "studioflow", label: "StudioFlow" },
    { id: "master-data", label: "Master Data" },
    { id: "bq", label: "BQ" },
  ]);

  const tagOptions = useMemo(
    () => tagOverlay.options.map((option) => ({
      id: option.id,
      label: option.label,
      keywords: [option.label],
    })),
    [tagOverlay.options],
  );

  const filteredRows = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return ROWS
      .filter((row) => (statusFilter === "all" ? true : row.status === statusFilter))
      .filter((row) => !term || [row.code, row.name, row.owner, row.notes].some((value) => value.toLowerCase().includes(term)))
      .sort((left, right) => {
        const a = left.name.localeCompare(right.name);
        return sortDirection === "asc" ? a : -a;
      });
  }, [debouncedSearch, sortDirection, statusFilter]);

  const selectedCount = selectedIds.length;
  const currentNoteInitial = "This note starts dirty only after editing.";
  const noteGuard = useUnsavedChangesGuard({
    value: note,
    initialValue: currentNoteInitial,
    title: "Discard note changes?",
    description: "The note has unsaved edits. Discard them and reset the demo form?",
  });

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const selectAllVisible = () => {
    setSelectedIds(filteredRows.map((row) => row.id));
  };

  const clearSelection = () => setSelectedIds([]);

  const stageTemporaryTag = () => {
    const label = `Tag ${Math.floor(Math.random() * 100)}`;
    const id = label.toLowerCase().replace(/\s+/g, "-");
    tagOverlay.upsertOverlayOption({ id, label });
    setSelectedTag(id);
    setLastAction(`Staged overlay option "${label}".`);
  };

  const rowsForMenu = filteredRows;

  return (
    <AppShell
      collapsible
      brand={
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-card border border-line bg-surface shadow-sm">
            <Sparkles className="h-4 w-4 text-ink" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <Text as="span" className="block font-semibold leading-none">
              UI Engine
            </Text>
            <Text as="span" tone="tertiary" size="sm" className="block truncate">
              UI-F1 showcase
            </Text>
          </div>
        </div>
      }
      collapsedBrand={<Text as="span" className="font-semibold">UI</Text>}
      navigationLabel="UI Engine showcase navigation"
      navigation={
        <div className="grid gap-1">
          <NavItem href="#shell" icon={<LayoutGrid size={17} />}>Shell</NavItem>
          <NavItem href="#directory" icon={<Filter size={17} />}>Directory</NavItem>
          <NavItem href="#forms" icon={<Sparkles size={17} />}>Forms</NavItem>
          <NavItem href="#overlays" icon={<CircleAlert size={17} />}>Overlays</NavItem>
        </div>
      }
      utility={
        <div className="grid gap-1">
          <Button variant="ghost" className="justify-start" leadingIcon={<PanelLeftOpen aria-hidden="true" />}>
            Desktop rail
          </Button>
          <Button variant="ghost" className="justify-start" leadingIcon={<PanelLeftClose aria-hidden="true" />}>
            Collapsed rail
          </Button>
        </div>
      }
      topbar={
        <div className="flex w-full flex-col items-start gap-1.5 px-(--ui-page-padding) sm:flex-row sm:items-center">
          <div className="grid min-w-0 gap-0.5">
            <Text meta>Showcase</Text>
            <Text as="span" weight="semibold">
              Shared components, patterns, and interaction states
            </Text>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <Badge tone="neutral">Foundation</Badge>
            <Badge tone="success">Ready</Badge>
          </div>
        </div>
      }
    >
      <PageShell size="wide">
        <PageHeader
          eyebrow="UI Engine"
          title="UI-F1 showcase"
          description="A public route with no domain imports that demonstrates the shared shell, patterns, tables, forms, overlays, and responsive behavior."
          actions={<Button variant="primary" leadingIcon={<ArrowRight aria-hidden="true" />}>Use shared components</Button>}
        />

        <PageSection title="Shell" description="AppShell, PageShell, PageHeader, and the warm chrome / white plane relationship.">
          <SectionCard id="shell">
            <div className="grid gap-4">
              <Notice tone="neutral" title="Design contract">
                This route is intentionally self-contained so it can be reviewed even when app data is unavailable.
              </Notice>
              <DescriptionList columns={2}>
                <DescriptionItem label="Canvas">Near-white ground and bordered white surfaces.</DescriptionItem>
                <DescriptionItem label="Typography">Lora for headings, Inter for controls and data.</DescriptionItem>
                <DescriptionItem label="Density">Compact operational spacing, 16px page rhythm.</DescriptionItem>
                <DescriptionItem label="Motion">Short, predictable transitions only.</DescriptionItem>
              </DescriptionList>
            </div>
          </SectionCard>
        </PageSection>

        <PageSection title="Directory" description="Table chrome, search, filter state, selection, row actions, and pagination.">
          <SectionCard id="directory">
            <div className="grid gap-4">
              <TableToolbar
                search={
                  <SearchField
                    label="Search records"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onClear={() => setSearch("")}
                  />
                }
                filters={
                  <FilterBar active={statusFilter !== "all"} onClear={() => setStatusFilter("all")} clearLabel="All records">
                    <Button size="sm" variant={statusFilter === "all" ? "primary" : "ghost"} onClick={() => setStatusFilter("all")}>All</Button>
                    <Button size="sm" variant={statusFilter === "active" ? "primary" : "ghost"} onClick={() => setStatusFilter("active")}>Active</Button>
                    <Button size="sm" variant={statusFilter === "draft" ? "primary" : "ghost"} onClick={() => setStatusFilter("draft")}>Draft</Button>
                    <Button size="sm" variant={statusFilter === "archived" ? "primary" : "ghost"} onClick={() => setStatusFilter("archived")}>Archived</Button>
                  </FilterBar>
                }
                actions={
                  <Button variant="secondary" size="sm" onClick={selectAllVisible}>
                    Select visible
                  </Button>
                }
              >
                {selectedCount > 0 ? (
                  <SelectionBar
                    count={selectedCount}
                    variant="inline"
                    label={(count) => `${count} record${count === 1 ? "" : "s"} selected`}
                  >
                    <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
                    <Button size="sm" variant="danger" onClick={() => setLastAction("Bulk delete requested.")}>
                      Delete
                    </Button>
                  </SelectionBar>
                ) : null}
              </TableToolbar>

              <DataTable minWidth={980} stickyHeader>
                <TableHeader>
                  <TableRow>
                    <TableHead aria-label="Select rows" />
                    <TableHead sortable sortDirection={sortDirection} onSortChange={setSortDirection} sortLabel={(direction) => `Name, sort ${direction}`}>
                      Name
                    </TableHead>
                    <TableHead data-column="identifier">Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead align="end">Amount</TableHead>
                    <TableHead align="end">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsForMenu.map((row) => (
                    <TableRow key={row.id} selected={selectedIds.includes(row.id)}>
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name}`}
                          checked={selectedIds.includes(row.id)}
                          onChange={() => toggleSelected(row.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <TableCellContent primary={row.name} secondary={row.notes} primaryLines={2} />
                      </TableCell>
                      <TableCell data-column="identifier">{row.code}</TableCell>
                      <TableCell>
                        {row.status === "active" ? (
                          <StatusBadge tone="success">Active</StatusBadge>
                        ) : row.status === "draft" ? (
                          <StatusBadge tone="warning">Draft</StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral">Archived</StatusBadge>
                        )}
                      </TableCell>
                      <TableCell>{row.owner}</TableCell>
                      <TableCell align="end">{row.amount}</TableCell>
                      <TableCell align="end">
                        <div className="inline-flex items-center gap-2">
                          <RowActionMenu
                            label={`Actions for ${row.name}`}
                            items={[
                              { label: "Open detail", onSelect: () => setDrawerOpen(true) },
                              { label: "Quick edit", onSelect: () => setDialogOpen(true) },
                              { label: "Remove", danger: true, onSelect: () => setConfirmDeleteTarget(row) },
                            ]}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>

              <Pagination
                page={1}
                pageCount={4}
                onPageChange={(page) => setLastAction(`Page changed to ${page}.`)}
              />

              <Notice tone="neutral" title="Latest action">
                {lastAction}
              </Notice>
            </div>
          </SectionCard>
        </PageSection>

        <PageSection title="Forms" description="Field wiring, comboboxes, creatable search, and unsaved-change guarding.">
          <SectionCard id="forms">
            <div className="grid gap-5 lg:grid-cols-2">
              <FormSection title="Controls" description="Shared primitives keep the control ladder consistent.">
                <Field label="Display name" id="showcase-name" description="This field is wired through Field so the label and description stay attached.">
                  <Input id="showcase-name" defaultValue="StudioFlow" />
                </Field>
                <Field label="Currency" id="showcase-currency">
                  <Select id="showcase-currency" defaultValue="IDR">
                    <option value="IDR">IDR</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </Select>
                </Field>
                <Field label="Notes" id="showcase-notes">
                  <Textarea id="showcase-notes" defaultValue="Notes stay vertically compact." />
                </Field>
                <RadioGroup
                  label="Tone"
                  value="quiet"
                  onValueChange={() => undefined}
                  options={[
                    { value: "quiet", label: "Quiet" },
                    { value: "balanced", label: "Balanced" },
                    { value: "dense", label: "Dense" },
                  ]}
                />
              </FormSection>

              <div className="grid gap-4">
                <Combobox
                  label="Choose status"
                  options={COMBO_OPTIONS}
                  value={selectedCombo}
                  onValueChange={setSelectedCombo}
                />
                <CreatableSearch
                  label="Choose tag"
                  options={tagOptions}
                  value={selectedTag}
                  onValueChange={setSelectedTag}
                  onCreate={(label) => {
                    const id = label.toLowerCase().replace(/\s+/g, "-");
                    tagOverlay.upsertOverlayOption({ id, label });
                    setSelectedTag(id);
                    setLastAction(`Created "${label}".`);
                    return id;
                  }}
                  allowClear
                  clearLabel="None"
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={stageTemporaryTag} leadingIcon={<Sparkles aria-hidden="true" />}>
                    Stage overlay option
                  </Button>
                  <Button variant="primary" onClick={() => setDialogOpen(true)}>
                    Open dialog
                  </Button>
                  <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
                    Open drawer
                  </Button>
                </div>
                <Surface className="p-4">
                  <div className="grid gap-3">
                    <div className="grid gap-1">
                      <Heading level={4}>Unsaved changes guard</Heading>
                      <Text tone="secondary">The note below uses the generic dirty-state hook.</Text>
                    </div>
                    <Field label="Draft note" id="showcase-draft-note">
                      <Textarea
                        id="showcase-draft-note"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                      />
                    </Field>
                    <FormActions align="between">
                      <Button variant="ghost" onClick={() => noteGuard.requestDiscard(() => setNote(currentNoteInitial))}>
                        Reset
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => {
                          noteGuard.markSaved(note);
                          setLastAction("Note saved.");
                        }}
                      >
                        Save note
                      </Button>
                    </FormActions>
                    {noteGuard.isDirty ? <InlineError>Unsaved changes are active.</InlineError> : null}
                  </div>
                </Surface>
              </div>
            </div>
          </SectionCard>
        </PageSection>

        <PageSection title="States" description="Loading, empty, error, badges, notices, skeletons, and overlays.">
          <SectionCard id="overlays">
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-3">
                <LoadingState title="Loading records" description="The shared loading state stays restrained." />
                <EmptyState title="No data yet" description="An empty state is distinct from an error state." />
                <ErrorState title="Unable to load" description="Errors should not resemble an empty list." />
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">Neutral badge</Badge>
                <Badge tone="success">Success badge</Badge>
                <Badge tone="warning">Warning badge</Badge>
                <Badge tone="danger">Danger badge</Badge>
                <StatusBadge tone="success">Status badge</StatusBadge>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-4/5" />
                <Skeleton className="h-6 w-2/3" />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Notice tone="success" title="Saved">
                  Positive state feedback.
                </Notice>
                <Notice tone="warning" title="Check carefully">
                  Warning state feedback.
                </Notice>
              </div>
            </div>
          </SectionCard>
        </PageSection>
      </PageShell>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Quick edit"
        description="This is a compact dialog using the shared overlay surface."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setDialogOpen(false);
            setLastAction("Dialog saved.");
          }}
        >
          <Field label="Title" id="showcase-dialog-title">
            <Input id="showcase-dialog-title" defaultValue="Example title" />
          </Field>
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save
            </Button>
          </FormActions>
        </form>
      </Dialog>

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Detail drawer"
        description="The drawer keeps list context intact."
        size="lg"
      >
        <div className="grid gap-4">
          <DescriptionList columns={1}>
            <DescriptionItem label="Record">Arbor Linen</DescriptionItem>
            <DescriptionItem label="Status">Active</DescriptionItem>
            <DescriptionItem label="Owner">Nadia</DescriptionItem>
          </DescriptionList>
          <Notice tone="neutral" title="Drawer content">
            Replace this with a real detail workflow when a consumer requires it.
          </Notice>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteTarget(null);
        }}
        title={`Delete ${confirmDeleteTarget?.name ?? "record"}?`}
        description="The destructive confirmation is separated and explicit."
        confirmLabel="Delete record"
        tone="danger"
        onConfirm={() => {
          setLastAction(`Deleted ${confirmDeleteTarget?.name ?? "record"}.`);
          setConfirmDeleteTarget(null);
        }}
      />

      {noteGuard.confirmDialog}
      {confirm.dialog}
    </AppShell>
  );
}
