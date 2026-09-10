"use client";
import { CurateShowcase } from "./curate-showcase";

import { useMemo, useState } from "react";
import { ArrowRight, CircleAlert, Filter, LayoutGrid, PanelLeftClose, PanelLeftOpen, Pencil, Sparkles, Trash2 } from "lucide-react";

import {
  AppShell,
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Combobox,
  ConfirmDialog,
  CountBadge,
  CreatableSearch,
  DataTable,
  DescriptionItem,
  DescriptionList,
  Dialog,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FilterChip,
  FormActions,
  FormSection,
  GroupHeader,
  Heading,
  IconButton,
  InlineError,
  Input,
  LoadingState,
  MetaList,
  NavItem,
  Notice,
  PageHeader,
  PageSection,
  PageShell,
  Pagination,
  PipelineStrip,
  ProgressBar,
  RadioGroup,
  SearchField,
  SectionCard,
  SegmentBar,
  Select,
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
  Tabs,
  Text,
  Textarea,
  type SortDirection,
  useConfirm,
  useDebouncedValue,
  useOptionOverlay,
  useUnsavedChangesGuard,
} from "@/platform/ui_engine";

type ShowcaseRow = {
  id: string;
  code: string;
  name: string;
  vendor: string;
  status: "draft" | "active" | "archived";
  unit: string;
  price: string;
  notes: string;
};

type ShowcaseSortKey = "name" | "vendor" | "price";

const ROWS: ShowcaseRow[] = [
  { id: "r1", code: "BRD-001", name: "Arbor Linen", vendor: "Nadia Supply", status: "active", unit: "SHEET", price: "Rp 18.000", notes: "Primary supplier price" },
  { id: "r2", code: "BRD-002", name: "Tide Ash", vendor: "Bima Trading", status: "draft", unit: "M2", price: "Rp 12.500", notes: "Pending supplier review" },
  { id: "r3", code: "BRD-003", name: "Hearth Clay", vendor: "Maya Corp", status: "active", unit: "SHEET", price: "Rp 24.750", notes: "Featured material" },
  { id: "r4", code: "BRD-004", name: "North Reed", vendor: "Ari Group", status: "archived", unit: "PCS", price: "Rp 9.900", notes: "Archived row for review" },
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
  const [sort, setSort] = useState<{ key: ShowcaseSortKey; direction: SortDirection }>({ key: "name", direction: "asc" });
  const changeSort = (key: ShowcaseSortKey) => (direction: SortDirection) => setSort({ key, direction });
  const [selectedCombo, setSelectedCombo] = useState("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastAction, setLastAction] = useState<string>("Ready.");
  const [note, setNote] = useState("This note starts dirty only after editing.");
  const [selectedTag, setSelectedTag] = useState("studioflow");
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
      .filter((row) => !term || [row.code, row.name, row.vendor, row.notes].some((value) => value.toLowerCase().includes(term)))
      .sort((left, right) => {
        const lv = sort.key === "vendor" ? left.vendor : sort.key === "price" ? left.price : left.name;
        const rv = sort.key === "vendor" ? right.vendor : sort.key === "price" ? right.price : right.name;
        const cmp = lv.localeCompare(rv);
        return sort.direction === "asc" ? cmp : -cmp;
      });
  }, [debouncedSearch, sort, statusFilter]);
  const currentNoteInitial = "This note starts dirty only after editing.";
  const noteGuard = useUnsavedChangesGuard({
    value: note,
    initialValue: currentNoteInitial,
    title: "Discard note changes?",
    description: "The note has unsaved edits. Discard them and reset the demo form?",
  });

  const stageTemporaryTag = () => {
    const label = `Tag ${Math.floor(Math.random() * 100)}`;
    const id = label.toLowerCase().replace(/\s+/g, "-");
    tagOverlay.upsertOverlayOption({ id, label });
    setSelectedTag(id);
    setLastAction(`Staged overlay option "${label}".`);
  };

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
          divider
        />

        <CurateShowcase />
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

        <PageSection title="Directory" description="Table chrome, search, status filter, sortable columns, status badge, and inline row actions.">
          <SectionCard id="directory">
            <div className="grid gap-4">
              <TableToolbar>
                <div className="flex flex-wrap items-center gap-3">
                  <SearchField
                    label="Search records"
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); }}
                    onClear={() => setSearch("")}
                    placeholder="Search records..."
                  />
                  <Select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as "all" | ShowcaseRow["status"])}
                    className="w-36"
                  >
                    <option value="all">All status</option>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </Select>
                </div>
              </TableToolbar>

              <DataTable minWidth={720}>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      sortable
                      sortDirection={sort.key === "name" ? sort.direction : null}
                      onSortChange={changeSort("name")}
                      sortLabel={(d) => `Name, sort ${d}`}
                    >
                      Name
                    </TableHead>
                    <TableHead
                      sortable
                      sortDirection={sort.key === "vendor" ? sort.direction : null}
                      onSortChange={changeSort("vendor")}
                      sortLabel={(d) => `Vendor, sort ${d}`}
                    >
                      Vendor
                    </TableHead>
                    <TableHead
                      align="end"
                      sortable
                      sortDirection={sort.key === "price" ? sort.direction : null}
                      onSortChange={changeSort("price")}
                      sortLabel={(d) => `Price, sort ${d}`}
                    >
                      Price
                    </TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead align="end">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <TableCellContent
                          primary={<span className="font-semibold">{row.name}</span>}
                          secondary={<span className="font-ui-mono text-xs">{row.code}</span>}
                        />
                      </TableCell>
                      <TableCell>{row.vendor}</TableCell>
                      <TableCell align="end">{row.price}</TableCell>
                      <TableCell>
                        <span className="font-ui-mono text-xs">{row.unit}</span>
                      </TableCell>
                      <TableCell>
                        {row.status === "active" ? (
                          <StatusBadge tone="success">Active</StatusBadge>
                        ) : row.status === "draft" ? (
                          <StatusBadge tone="warning">Draft</StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral">Archived</StatusBadge>
                        )}
                      </TableCell>
                      <TableCell align="end">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            size="sm"
                            variant="ghost"
                            label={`Edit ${row.name}`}
                            icon={<Pencil size={15} aria-hidden="true" />}
                            onClick={() => { setDialogOpen(true); setLastAction(`Edit: ${row.name}`); }}
                          />
                          <IconButton
                            size="sm"
                            variant="ghost"
                            label={`Delete ${row.name}`}
                            icon={<Trash2 size={15} aria-hidden="true" />}
                            onClick={() => setConfirmDeleteTarget(row)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>

              {filteredRows.length > 0 ? (
                <Pagination
                  page={1}
                  pageCount={Math.max(1, Math.ceil(ROWS.length / 25))}
                  onPageChange={(page) => setLastAction(`Page changed to ${page}.`)}
                />
              ) : null}

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

        <PageSection
          title="Identity, progress, and context"
          description="Atoms that carry a person, a count, a position, or a place in the hierarchy. Every one of them has a text alternative — none signals by colour alone."
        >
          <SectionCard
            id="context"
            title="Framed section"
            count={3}
            description="A section title lives in its own bar above a hairline."
            action={<Button variant="ghost" size="sm">Action</Button>}
          >
            <div className="grid gap-5">
              <Breadcrumb
                entries={[{ label: "Projects", href: "#context" }, { label: "Kopi Kalyana Senopati" }]}
              />

              <MetaList
                items={[
                  <span key="c" className="font-ui-mono text-xs">PRJ-0148</span>,
                  "Kalyana Group",
                  "148 m²",
                  "Dibuka 12 Jun 2026",
                ]}
              />

              <div className="flex flex-wrap items-center gap-3">
                <Avatar name="Admin Rad" size="sm" />
                <Avatar name="Designer DIC" />
                <Avatar name="Drafter Rad" size="lg" />
                <CountBadge>12</CountBadge>
                <FilterChip selected count={4}>Mine</FilterChip>
                <FilterChip count={7}>All</FilterChip>
              </div>

              <div className="grid gap-2 md:max-w-80">
                <ProgressBar value={8} max={12} label="8 of 12 approved" />
                <SegmentBar segments={["done", "done", "current", "idle", "idle"]} label="2 of 5 phases done" />
              </div>

              <GroupHeader title="Overdue" count={2} tone="danger" />

              <PipelineStrip
                steps={[
                  { id: "1", label: "Moodboard", note: "Approved 28 Jun", detail: "3 rev", state: "done" },
                  { id: "2", label: "Layout 2D", note: "Approved 22 Jul", detail: "4 rev", state: "done" },
                  { id: "3", label: "Design 3D", note: "On client review", detail: "v5.2", state: "current" },
                  { id: "4", label: "Construction", note: "Not started", detail: "—", state: "upcoming" },
                ]}
                label="Phase pipeline"
              />
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
