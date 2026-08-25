"use client";

import {
  Archive,
  Check,
  CircleHelp,
  Copy,
  FileText,
  Plus,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { useState } from "react";

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
  { id: "R-014", name: "Sample record", group: "General", updated: "Today", status: "Active" },
  { id: "R-013", name: "Reference item", group: "Archive", updated: "Yesterday", status: "Review" },
  { id: "R-012", name: "Working draft", group: "General", updated: "22 Aug", status: "Draft" },
] as const;

const options = [
  { id: "alpha", label: "Option alpha", description: "Primary choice", keywords: ["one"] },
  { id: "beta", label: "Option beta", description: "Secondary choice", keywords: ["two"] },
  { id: "gamma", label: "Option gamma", description: "Unavailable example", disabled: true },
] as const;

export function UiEngineShowcase() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [filterActive, setFilterActive] = useState(true);
  const [selectedRows, setSelectedRows] = useState<string[]>(["R-014"]);
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
      brand={(
        <a className={styles.brand} href="#top">
          <span>SF</span>
          <strong>UI Engine</strong>
        </a>
      )}
      navigation={(
        <div className={styles.navigation}>
          <a href="#foundations">Foundations</a>
          <a href="#controls">Controls</a>
          <a href="#data">Data</a>
          <a href="#layouts">Layouts</a>
          <a href="#patterns">Patterns</a>
          <a href="#document">Document</a>
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
              <Text>Operational body text at the compact base size.</Text>
              <Text size="sm" tone="secondary">Secondary supporting text.</Text>
            </SectionCard>
            <SectionCard className={styles.stack}>
              <Text meta>Semantic tones</Text>
              <div className={styles.rowWrap}>
                <StatusBadge tone="neutral">Neutral</StatusBadge>
                <StatusBadge tone="success">Success</StatusBadge>
                <StatusBadge tone="warning">Warning</StatusBadge>
                <StatusBadge tone="danger">Danger</StatusBadge>
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
            <DataTable minWidth={720} density="compact" stickyHeader>
              <TableHeader>
                <TableRow>
                  <TableHead><span className={styles.visuallyHidden}>Select</span></TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead align="end"><span className={styles.visuallyHidden}>Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => {
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
                      <TableCell><Text size="sm" tone="secondary">{record.id}</Text></TableCell>
                      <TableCell><Text weight="medium">{record.name}</Text></TableCell>
                      <TableCell>{record.group}</TableCell>
                      <TableCell>{record.updated}</TableCell>
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
                        <DescriptionList>
                          <DescriptionItem label="Owner">Example user</DescriptionItem>
                          <DescriptionItem label="Updated">Today</DescriptionItem>
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
