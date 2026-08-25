"use client";

import {
  Archive,
  Check,
  CircleHelp,
  Copy,
  FileText,
  Layers,
  LayoutGrid,
  MousePointerClick,
  Plus,
  Save,
  Settings2,
  SlidersHorizontal,
  Table2,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  AppShell,
  Badge,
  Button,
  Checkbox,
  Combobox,
  ConfirmDialog,
  DataTable,
  DescriptionItem,
  DescriptionList,
  DetailShell,
  Dialog,
  DirectoryShell,
  Divider,
  DocumentSheet,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FileDropZone,
  FilterBar,
  FormActions,
  FormSection,
  Heading,
  IconButton,
  InlineEdit,
  Input,
  LoadingState,
  NavItem,
  Notice,
  PageHeader,
  PageSection,
  PageShell,
  Pagination,
  RadioGroup,
  ReorderHandle,
  RowActionMenu,
  SearchField,
  SectionCard,
  Select,
  SelectionBar,
  SettingsShell,
  Skeleton,
  SplitPane,
  StatusBadge,
  Surface,
  Switch,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Tabs,
  Text,
  Textarea,
  Tooltip,
  WorkspaceShell,
} from "@/platform/ui_engine";

import styles from "./showcase.module.css";

const records = [
  { id: "R-1048", name: "Sample record", group: "General", updatedAt: "2026-08-25", items: 12, amount: 1240, status: "Active" },
  { id: "R-1047", name: "Reference item with a longer descriptive label", group: "Archive", updatedAt: "2026-08-25", items: 3, amount: 96.5, status: "Review" },
  { id: "R-1046", name: "Working draft", group: "General", updatedAt: "2026-08-24", items: 148, amount: 12880, status: "Draft" },
  { id: "R-1045", name: "Second sample", group: "General", updatedAt: "2026-08-24", items: 7, amount: 412.75, status: "Active" },
  { id: "R-1044", name: "Archived reference", group: "Archive", updatedAt: "2026-08-23", items: 1, amount: 18, status: "Draft" },
  { id: "R-1043", name: "Pending entry", group: "Review", updatedAt: "2026-08-23", items: 64, amount: 5309.2, status: "Review" },
  { id: "R-1042", name: "Third sample", group: "General", updatedAt: "2026-08-22", items: 22, amount: 2104, status: "Active" },
  { id: "R-1041", name: "Short", group: "Archive", updatedAt: "2026-08-22", items: 9, amount: 735.4, status: "Draft" },
  { id: "R-1040", name: "Fourth sample", group: "General", updatedAt: "2026-08-21", items: 310, amount: 27650, status: "Active" },
  { id: "R-1039", name: "Secondary reference", group: "Review", updatedAt: "2026-08-21", items: 5, amount: 268.9, status: "Review" },
  { id: "R-1038", name: "Fifth sample", group: "General", updatedAt: "2026-08-20", items: 41, amount: 3472.15, status: "Active" },
  { id: "R-1037", name: "Older draft", group: "Archive", updatedAt: "2026-08-19", items: 2, amount: 54, status: "Draft" },
];

type Record_ = (typeof records)[number];
type SortKey = "id" | "name" | "group" | "updatedAt" | "items" | "amount" | "status";

/**
 * Sort semantics live here, in the app — not in the UI Engine. Only this side
 * knows that `updatedAt` sorts as a date rather than as its printed label, and
 * that `amount` sorts as a number rather than as its formatted string.
 */
const compare: Record<SortKey, (a: Record_, b: Record_) => number> = {
  id: (a, b) => a.id.localeCompare(b.id),
  name: (a, b) => a.name.localeCompare(b.name),
  group: (a, b) => a.group.localeCompare(b.group),
  status: (a, b) => a.status.localeCompare(b.status),
  updatedAt: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
  items: (a, b) => a.items - b.items,
  amount: (a, b) => a.amount - b.amount,
};

const navSections = [
  { id: "foundations", label: "Foundations", icon: <Layers /> },
  { id: "controls", label: "Controls", icon: <SlidersHorizontal /> },
  { id: "data", label: "Data", icon: <Table2 /> },
  { id: "layouts", label: "Layouts", icon: <LayoutGrid /> },
  { id: "patterns", label: "Patterns", icon: <MousePointerClick /> },
  { id: "document", label: "Document", icon: <FileText /> },
];

const sortableColumns: { key: SortKey; label: string; align?: "start" | "end" }[] = [
  { key: "id", label: "Reference" },
  { key: "name", label: "Name" },
  { key: "group", label: "Group" },
  { key: "updatedAt", label: "Updated" },
  { key: "items", label: "Items", align: "end" },
  { key: "amount", label: "Amount", align: "end" },
  { key: "status", label: "Status" },
];

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const formatDate = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));

const options = [
  { id: "alpha", label: "Option alpha", description: "Primary choice", keywords: ["one"] },
  { id: "beta", label: "Option beta", description: "Secondary choice", keywords: ["two"] },
  { id: "gamma", label: "Option gamma", description: "Unavailable example", disabled: true },
] as const;

export function UiEngineShowcase() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" } | null>(null);
  const [section, setSection] = useState("foundations");

  // Track the section actually in view rather than the last hash the user clicked.
  // A hash goes stale the moment someone scrolls; what the rail should answer is
  // "where am I", not "what did I last press".
  useEffect(() => {
    const targets = navSections
      .map(({ id }) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (!targets.length) return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        if (!visible.size) return;
        const [topmost] = [...visible.entries()].sort((a, b) => a[1] - b[1]);
        setSection(topmost[0]);
      },
      { rootMargin: "-72px 0px -55% 0px", threshold: 0 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const sortedRecords = useMemo(() => {
    if (!sort) return records;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...records].sort((a, b) => compare[sort.key](a, b) * factor);
  }, [sort]);
  const [filterActive, setFilterActive] = useState(true);
  const [selectedRows, setSelectedRows] = useState<string[]>(["R-1048"]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [choice, setChoice] = useState("alpha");
  const [inlineValue, setInlineValue] = useState("Editable value");
  const [inlineDraft, setInlineDraft] = useState(inlineValue);
  const [inlineEditing, setInlineEditing] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const toggleRow = (id: string, checked: boolean | "indeterminate") => {
    setSelectedRows((current) => checked === true
      ? Array.from(new Set([...current, id]))
      : current.filter((rowId) => rowId !== id));
  };

  return (
    <AppShell
      collapsible
      collapsedBrand={<span className={styles.brandMark}>SF</span>}
      brand={(
        <a className={styles.brand} href="#top">
          <span>SF</span>
          <strong>UI Engine</strong>
        </a>
      )}
      navigation={(
        <div className={styles.navigation}>
          {navSections.map(({ id, label, icon }) => (
            <NavItem key={id} href={`#${id}`} icon={icon} active={section === id}>
              {label}
            </NavItem>
          ))}
        </div>
      )}
      utility={<Text size="sm" tone="tertiary">Internal style lab</Text>}
      topbar={(
        <div className={styles.topbar}>
          <Text weight="medium">Shared product kit</Text>
          <Badge tone="success">Foundation</Badge>
        </div>
      )}
    >
      <PageShell id="top" size="wide">
        <PageHeader
          eyebrow="UI Engine"
          title="Product kit"
          description="Shared foundations and reusable application patterns."
          actions={<Button variant="primary" leadingIcon={<Plus aria-hidden="true" />}>Primary action</Button>}
          divider
        />

        <PageSection
          id="foundations"
          title="Foundations"
          description="Type, surfaces, spacing, and semantic color."
        >
          <div className={styles.foundationGrid}>
            <SectionCard className={styles.stack}>
              <Text meta>Typography</Text>
              <Heading level={1}>Heading one</Heading>
              <Heading level={2}>Heading two</Heading>
              <Heading level={3}>Heading three</Heading>
              <Heading level={4}>Heading four</Heading>
              <Heading level={5}>Heading five</Heading>
              <Heading level={6}>Heading six</Heading>
              <Text>Operational body text at the compact base size.</Text>
              <Text size="sm" tone="secondary">Secondary supporting text.</Text>
            </SectionCard>
            <SectionCard className={styles.stack}>
              <Text meta>Status &mdash; record state</Text>
              <div className={styles.rowWrap}>
                <StatusBadge tone="neutral">Neutral</StatusBadge>
                <StatusBadge tone="success">Success</StatusBadge>
                <StatusBadge tone="warning">Warning</StatusBadge>
                <StatusBadge tone="danger">Danger</StatusBadge>
              </div>
              <Text meta>Badge &mdash; chips, tags, counts</Text>
              <div className={styles.rowWrap}>
                <Badge>Neutral</Badge>
                <Badge tone="success">Success</Badge>
                <Badge tone="warning">Warning</Badge>
                <Badge tone="danger">Danger</Badge>
              </div>
              <div className={styles.swatches} aria-label="Surface tokens">
                <div><span className={styles.canvasSwatch} /><Text size="sm">Canvas</Text></div>
                <div><span className={styles.surfaceSwatch} /><Text size="sm">Surface</Text></div>
                <div><span className={styles.mutedSwatch} /><Text size="sm">Muted</Text></div>
                <div><span className={styles.actionSwatch} /><Text size="sm">Action</Text></div>
              </div>
              <Divider />
              <div className={styles.surfacePair}>
                <Surface className={styles.sampleSurface}>Bordered surface</Surface>
                <Surface className={styles.sampleSurface} elevated>Elevated overlay</Surface>
              </div>
            </SectionCard>
          </div>
        </PageSection>

        <PageSection id="controls" title="Actions and controls" description="Accessible states with compact defaults.">
          <div className={styles.twoColumn}>
            <SectionCard className={styles.stack}>
              <Text meta>Actions</Text>
              <div className={styles.rowWrap}>
                <Button variant="primary" leadingIcon={<Save aria-hidden="true" />}>Save</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger" leadingIcon={<Trash2 aria-hidden="true" />}>Remove</Button>
                <Button pending>Saving</Button>
                <Button disabled>Disabled</Button>
                <Tooltip content="More information">
                  <IconButton label="More information" icon={<CircleHelp aria-hidden="true" />} />
                </Tooltip>
              </div>
              <Notice tone="success" title="Saved">The visible state is up to date.</Notice>
              <Notice tone="warning" title="Review">One field needs attention.</Notice>
            </SectionCard>

            <SectionCard>
              <FormSection className={styles.showcaseForm} title="Form composition" description="Labels and messages stay close to their controls.">
                <div className={styles.formGrid}>
                  <Field label="Record name" required description="Shown in directory views.">
                    <Input defaultValue="Sample record" />
                  </Field>
                  <Field label="Group">
                    <Select defaultValue="general">
                      <option value="general">General</option>
                      <option value="archive">Archive</option>
                    </Select>
                  </Field>
                  <Field label="Reference" error="Use at least four characters.">
                    <Input defaultValue="A1" invalid />
                  </Field>
                  <Field label="Locked field" description="Unavailable in this state.">
                    <Input defaultValue="Read only" disabled />
                  </Field>
                  <Field label="Notes" className={styles.fullWidth}>
                    <Textarea placeholder="Optional note" />
                  </Field>
                </div>
                <div className={styles.choiceRow}>
                  <Checkbox label="Include details" defaultChecked />
                  <Switch label="Enabled" defaultChecked />
                </div>
                <RadioGroup
                  label="Density"
                  orientation="horizontal"
                  defaultValue="compact"
                  options={[
                    { value: "compact", label: "Compact" },
                    { value: "regular", label: "Regular" },
                  ]}
                />
                <FormActions>
                  <Button variant="ghost">Cancel</Button>
                  <Button variant="primary">Save changes</Button>
                </FormActions>
              </FormSection>
            </SectionCard>
          </div>
        </PageSection>

        <PageSection id="data" title="Data directory" description="Selection, filters, state slots, and overflow.">
          <DirectoryShell
            header={(
              <PageHeader
                eyebrow="Directory"
                title="Records"
                description="Reusable table composition."
                actions={<Button variant="primary" size="sm" leadingIcon={<Plus aria-hidden="true" />}>New record</Button>}
              />
            )}
            toolbar={(
              <TableToolbar
                search={(
                  <SearchField
                    label="Search records"
                    placeholder="Search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onClear={() => setQuery("")}
                  />
                )}
                filters={(
                  <FilterBar active={filterActive} onClear={() => setFilterActive(false)}>
                    <Select aria-label="Record group" defaultValue="all">
                      <option value="all">All groups</option>
                      <option value="general">General</option>
                    </Select>
                  </FilterBar>
                )}
                actions={<Button size="sm" variant="secondary">Export</Button>}
              />
            )}
            pagination={<Pagination page={page} pageCount={4} onPageChange={setPage} />}
          >
            {selectedRows.length ? (
              <SelectionBar count={selectedRows.length}>
                <Button size="sm" variant="ghost" leadingIcon={<Archive aria-hidden="true" />}>Archive</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedRows([])}>Clear</Button>
              </SelectionBar>
            ) : null}
            <DataTable minWidth={880} density="compact" stickyHeader>
              <TableHeader>
                <TableRow>
                  <TableHead><span className={styles.visuallyHidden}>Select</span></TableHead>
                  {sortableColumns.map(({ key, label, align }) => (
                    <TableHead
                      key={key}
                      align={align}
                      sortable
                      sortDirection={sort?.key === key ? sort.direction : null}
                      onSortChange={(direction) => setSort({ key, direction })}
                      sortLabel={(direction) => `${label}, sort ${direction === "asc" ? "ascending" : "descending"}`}
                    >
                      {label}
                    </TableHead>
                  ))}
                  <TableHead align="end"><span className={styles.visuallyHidden}>Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRecords.map((record) => {
                  const selected = selectedRows.includes(record.id);
                  return (
                    <TableRow key={record.id} selected={selected}>
                      <TableCell>
                        <Checkbox
                          label={<span className={styles.visuallyHidden}>Select {record.name}</span>}
                          checked={selected}
                          onCheckedChange={(checked) => toggleRow(record.id, checked)}
                        />
                      </TableCell>
                      <TableCell data-column="identifier">{record.id}</TableCell>
                      <TableCell><Text weight="medium">{record.name}</Text></TableCell>
                      <TableCell>{record.group}</TableCell>
                      <TableCell>{formatDate(record.updatedAt)}</TableCell>
                      <TableCell align="end">{record.items}</TableCell>
                      <TableCell align="end">{money.format(record.amount)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={record.status === "Active" ? "success" : record.status === "Review" ? "warning" : "neutral"}>
                          {record.status}
                        </StatusBadge>
                      </TableCell>
                      <TableCell align="end">
                        <RowActionMenu items={[
                          { label: "Open", onSelect: () => undefined },
                          { label: "Duplicate", icon: <Copy aria-hidden="true" />, onSelect: () => undefined },
                          { label: "Remove", icon: <Trash2 aria-hidden="true" />, danger: true, separatorBefore: true, onSelect: () => setConfirmOpen(true) },
                        ]} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </DataTable>
          </DirectoryShell>

          <div className={styles.stateGrid}>
            <DataTable state={<LoadingState description="Fetching records." />} />
            <DataTable state={<EmptyState description="Create the first record to begin." action={<Button size="sm">Create</Button>} />} />
            <DataTable state={<ErrorState description="Try again in a moment." action={<Button size="sm">Retry</Button>} />} />
            <SectionCard className={styles.skeletonState} aria-label="Loading preview">
              <Skeleton /><Skeleton /><Skeleton />
            </SectionCard>
          </div>
        </PageSection>

        <PageSection id="layouts" title="Layouts" description="Composition only; content remains app-owned.">
          <Tabs
            items={[
              {
                value: "detail",
                label: "Detail",
                content: (
                  <DetailShell
                    header={<PageHeader eyebrow="Record" title="Detail view" actions={<Button size="sm" variant="primary">Edit</Button>} />}
                    aside={(
                      <SectionCard className={styles.stack}>
                        <Text meta>Summary</Text>
                        <DescriptionList columns={1}>
                          <DescriptionItem label="Reference">R-1048</DescriptionItem>
                          <DescriptionItem label="Owner">Example user</DescriptionItem>
                          <DescriptionItem label="Group">General</DescriptionItem>
                          <DescriptionItem label="Items">12</DescriptionItem>
                          <DescriptionItem label="Updated">25 Aug 2026</DescriptionItem>
                        </DescriptionList>
                      </SectionCard>
                    )}
                  >
                    <SectionCard className={styles.stack}>
                      <Heading level={3}>Main content</Heading>
                      <Text tone="secondary">A calm content column with an optional summary rail.</Text>
                    </SectionCard>
                  </DetailShell>
                ),
              },
              {
                value: "settings",
                label: "Settings",
                content: (
                  <SettingsShell navigation={<div className={styles.settingsNav}><button data-active>General</button><button>Access</button><button>Advanced</button></div>}>
                    <FormSection title="General settings">
                      <Field label="Workspace label"><Input defaultValue="Main workspace" /></Field>
                      <Switch label="Allow notifications" defaultChecked />
                    </FormSection>
                  </SettingsShell>
                ),
              },
              {
                value: "workspace",
                label: "Workspace",
                content: (
                  <WorkspaceShell
                    toolbar={<div className={styles.toolbarLine}><Text weight="medium">Working area</Text><Button size="sm">Add item</Button></div>}
                    footer={<Text size="sm" tone="secondary">3 items · Saved</Text>}
                  >
                    <SplitPane
                      primary={<div className={styles.workspaceCanvas}><FileText aria-hidden="true" /><Text>Primary workspace</Text></div>}
                      secondary={<div className={styles.inspector}><Text meta>Inspector</Text><Text tone="secondary">Selected item settings.</Text></div>}
                    />
                  </WorkspaceShell>
                ),
              },
            ]}
          />
        </PageSection>

        <PageSection id="patterns" title="Interaction patterns" description="Generic behavior with app-supplied persistence.">
          <div className={styles.patternGrid}>
            <SectionCard className={styles.stack}>
              <Text meta>Overlays</Text>
              <div className={styles.rowWrap}>
                <Button variant="secondary" onClick={() => setDialogOpen(true)}>Open dialog</Button>
                <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Open drawer</Button>
                <Button variant="danger" onClick={() => setConfirmOpen(true)}>Confirm action</Button>
              </div>
            </SectionCard>
            <SectionCard className={styles.stack}>
              <Text meta>Combobox</Text>
              <Combobox label="Option" options={options} value={choice} onValueChange={setChoice} />
              <Text size="sm" tone="secondary">Selected: {choice}</Text>
            </SectionCard>
            <SectionCard className={styles.stack}>
              <Text meta>Inline edit</Text>
              <InlineEdit
                value={<Text weight="medium">{inlineValue}</Text>}
                editing={inlineEditing}
                onEditingChange={(editing) => {
                  setInlineEditing(editing);
                  if (editing) setInlineDraft(inlineValue);
                }}
                editor={<Input autoFocus value={inlineDraft} onChange={(event) => setInlineDraft(event.target.value)} />}
                onCommit={() => { setInlineValue(inlineDraft); setInlineEditing(false); }}
                onCancel={() => { setInlineDraft(inlineValue); setInlineEditing(false); }}
              />
              <Text size="sm" tone="secondary">Click to edit. Enter saves; Escape cancels.</Text>
            </SectionCard>
            <SectionCard className={styles.stack}>
              <Text meta>Reorder</Text>
              {["First item", "Second item", "Third item"].map((item) => (
                <div className={styles.reorderRow} key={item}>
                  <ReorderHandle label={`Reorder ${item.toLowerCase()}`} />
                  <Text>{item}</Text>
                </div>
              ))}
            </SectionCard>
            <SectionCard className={styles.fileCard}>
              <Text meta>Files</Text>
              <FileDropZone files={files} onFiles={setFiles} multiple accept="image/*,.pdf" maxSize={5 * 1024 * 1024} />
            </SectionCard>
          </div>
        </PageSection>

        <PageSection id="document" title="Document surface" description="A4-like screen preview with print-only isolation.">
          <div className={styles.documentFrame}>
            <DocumentSheet
              title="Record summary"
              header={<div className={styles.documentMeta}><strong>STUDIOFLOW</strong><span>REF-2026-014</span></div>}
              footer={<div className={styles.documentMeta}><span>Generated for preview</span><span>Page 1</span></div>}
            >
              <div className={styles.documentBody}>
                <div>
                  <Text meta>Prepared for</Text>
                  <Heading level={3}>Example recipient</Heading>
                  <Text tone="secondary">A concise reusable document composition.</Text>
                </div>
                <table className={styles.documentTable}>
                  <thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>
                  <tbody>
                    <tr><td>First line</td><td>2</td><td>1,200.00</td></tr>
                    <tr><td>Second line</td><td>1</td><td>480.00</td></tr>
                    <tr><td>Third line</td><td>4</td><td>320.00</td></tr>
                  </tbody>
                  <tfoot><tr><th colSpan={2}>Total</th><th>2,000.00</th></tr></tfoot>
                </table>
              </div>
            </DocumentSheet>
          </div>
        </PageSection>
      </PageShell>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Edit record"
        description="A focused task in a medium dialog."
        footer={<><Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => setDialogOpen(false)}>Save</Button></>}
      >
        <div className={styles.stack}>
          <Field label="Record name" required><Input defaultValue="Sample record" /></Field>
          <Field label="Notes"><Textarea placeholder="Optional note" /></Field>
        </div>
      </Dialog>

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Record settings"
        description="A secondary task that preserves context."
        footer={<Button variant="primary" onClick={() => setDrawerOpen(false)}>Done</Button>}
      >
        <div className={styles.stack}>
          <Switch label="Enabled" defaultChecked />
          <Checkbox label="Include details" />
          <Field label="Display mode"><Select defaultValue="compact"><option value="compact">Compact</option><option value="regular">Regular</option></Select></Field>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove record?"
        description="This generic example does not persist any change."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => setConfirmOpen(false)}
      />
    </AppShell>
  );
}
