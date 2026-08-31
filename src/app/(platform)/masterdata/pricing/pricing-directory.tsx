"use client";

import { useState } from "react";
import { Archive, RotateCcw, Trash2 } from "lucide-react";

import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  SearchField,
  SectionCard,
  Select,
  Spinner,
  StatusBadge,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Tabs,
} from "@/platform/ui_engine";
import { archivePriceAction, requestPriceDeletionAction, restorePriceAction } from "./actions";

type MaterialPriceRow = {
  id: string;
  sku: { id: string; name: string; slug: string; code: string | null };
  supplier_vendor: { id: string; name: string; slug: string };
  amount: string;
  currency: string;
  unit: { id: string; code: string; name: string };
  deleted_at: Date | null;
  notes: string | null;
};

type WorkPriceRow = {
  id: string;
  name: string;
  slug: string;
  category: { id: string; name: string; slug: string };
  vendor: { id: string; name: string; slug: string };
  unit: { id: string; code: string; name: string };
  amount: string;
  currency: string;
  scope_note: string | null;
  deleted_at: Date | null;
  notes: string | null;
};

export function PricingDirectory({
  materialPrices,
  materialLaborPrices,
  laborPrices,
  canManageMaterial,
  canManageWork,
  canReadMaterial,
  canReadWork,
}: {
  materialPrices: MaterialPriceRow[];
  materialLaborPrices: WorkPriceRow[];
  laborPrices: WorkPriceRow[];
  canManageMaterial: boolean;
  canManageWork: boolean;
  canReadMaterial: boolean;
  canReadWork: boolean;
}) {
  const [matQuery, setMatQuery] = useState("");
  const [mlQuery, setMlQuery] = useState("");
  const [laborQuery, setLaborQuery] = useState("");
  const [matVendorFilter, setMatVendorFilter] = useState("ALL");
  const [mlVendorFilter, setMlVendorFilter] = useState("ALL");
  const [laborVendorFilter, setLaborVendorFilter] = useState("ALL");
  const [matStatusFilter, setMatStatusFilter] = useState("ALL");
  const [mlStatusFilter, setMlStatusFilter] = useState("ALL");
  const [laborStatusFilter, setLaborStatusFilter] = useState("ALL");

  // Archive/restore/delete state per tab
  const [archiveTarget, setArchiveTarget] = useState<{ type: "material" | "material-labor" | "labor"; id: string; name: string } | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<{ type: "material" | "material-labor" | "labor"; id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "material" | "material-labor" | "labor"; id: string; name: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const uniqueMatVendors = Array.from(new Map(materialPrices.map((p) => [p.supplier_vendor.id, p.supplier_vendor])).values());
  const uniqueMlVendors = Array.from(new Map(materialLaborPrices.map((p) => [p.vendor.id, p.vendor])).values());
  const uniqueLaborVendors = Array.from(new Map(laborPrices.map((p) => [p.vendor.id, p.vendor])).values());

  const filterMaterial = (p: MaterialPriceRow) => {
    if (matVendorFilter !== "ALL" && p.supplier_vendor.id !== matVendorFilter) return false;
    if (matStatusFilter === "ACTIVE" && p.deleted_at) return false;
    if (matStatusFilter === "ARCHIVED" && !p.deleted_at) return false;
    if (!matQuery) return true;
    const q = matQuery.toLowerCase();
    return (
      p.sku.name.toLowerCase().includes(q) ||
      (p.sku.code && p.sku.code.toLowerCase().includes(q)) ||
      p.supplier_vendor.name.toLowerCase().includes(q)
    );
  };

  const filterWork = (p: WorkPriceRow, query: string, vendorFilter: string, statusFilter: string) => {
    if (vendorFilter !== "ALL" && p.vendor.id !== vendorFilter) return false;
    if (statusFilter === "ACTIVE" && p.deleted_at) return false;
    if (statusFilter === "ARCHIVED" && !p.deleted_at) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.vendor.name.toLowerCase().includes(q) || p.category.name.toLowerCase().includes(q);
  };

  const filteredMaterial = materialPrices.filter(filterMaterial);
  const filteredML = materialLaborPrices.filter((p) => filterWork(p, mlQuery, mlVendorFilter, mlStatusFilter));
  const filteredLabor = laborPrices.filter((p) => filterWork(p, laborQuery, laborVendorFilter, laborStatusFilter));

  const runRowAction = (id: string, run: () => Promise<unknown>) => {
    setPendingId(id);
    run().finally(() => setPendingId(null));
  };

  const materialVendors = uniqueMatVendors;
  const workVendors = Array.from(new Map([...uniqueMlVendors, ...uniqueLaborVendors].map((v) => [v.id, v])).values());

  const tabs = [
    {
      value: "material",
      label: `Material Prices (${materialPrices.length})`,
      disabled: !canReadMaterial,
      content: (
        <div className="grid gap-4">
          <TableToolbar>
            <div className="flex flex-wrap items-center gap-3">
              <SearchField value={matQuery} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMatQuery(e.target.value)} onClear={() => setMatQuery("")} placeholder="Search by SKU, vendor..." />
              <div className="w-40">
                <Select value={matVendorFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMatVendorFilter(e.target.value)}>
                  <option value="ALL">All vendors</option>
                  {materialVendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </Select>
              </div>
              <div className="w-32">
                <Select value={matStatusFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMatStatusFilter(e.target.value)}>
                  <option value="ALL">All status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </div>
            </div>
          </TableToolbar>

          {filteredMaterial.length === 0 ? (
            <EmptyState title="No material prices" description={matQuery ? "No prices match your search." : "Add prices from SKU detail."} />
          ) : (
            <DataTable minWidth={700}>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead align="end">Price</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Status</TableHead>
                  {canManageMaterial && <TableHead align="end">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <tbody>
                {filteredMaterial.map((p) => {
                  const isPending = pendingId === p.id;
                  const isArchived = p.deleted_at !== null;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <TableCellContent primary={<span className="font-semibold">{p.sku.name}</span>} secondary={p.sku.code ? <span className="font-mono text-xs text-ink-secondary">{p.sku.code}</span> : undefined} />
                      </TableCell>
                      <TableCell>{p.supplier_vendor.name}</TableCell>
                      <TableCell align="end">
                        <TableCellContent primary={`${p.currency} ${Number(p.amount).toLocaleString()}`} />
                      </TableCell>
                      <TableCell><span className="font-mono text-xs">{p.unit.code}</span></TableCell>
                      <TableCell>
                        <StatusBadge tone={isArchived ? "neutral" : "success"}>{isArchived ? "Archived" : "Active"}</StatusBadge>
                      </TableCell>
                      {canManageMaterial && (
                        <TableCell align="end">
                          <div className="flex items-center justify-end gap-1.5">
                            {isPending ? <Spinner /> : null}
                            {!isArchived ? (
                              <Button size="sm" variant="ghost" onClick={() => setArchiveTarget({ type: "material", id: p.id, name: `${p.sku.name} / ${p.supplier_vendor.name}` })} disabled={isPending} title="Archive">
                                <Archive size={15} />
                              </Button>
                            ) : (
                              <>
                                <Button size="sm" variant="ghost" onClick={() => setRestoreTarget({ type: "material", id: p.id, name: `${p.sku.name} / ${p.supplier_vendor.name}` })} disabled={isPending} title="Restore">
                                  <RotateCcw size={15} />
                                </Button>
                                <Button size="sm" variant="danger" onClick={() => setDeleteTarget({ type: "material", id: p.id, name: `${p.sku.name} / ${p.supplier_vendor.name}` })} disabled={isPending} title="Request deletion">
                                  <Trash2 size={15} />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </tbody>
            </DataTable>
          )}
        </div>
      ),
    },
    {
      value: "material-labor",
      label: `Material + Labor (${materialLaborPrices.length})`,
      disabled: !canReadWork,
      content: (
        <div className="grid gap-4">
          <TableToolbar>
            <div className="flex flex-wrap items-center gap-3">
              <SearchField value={mlQuery} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMlQuery(e.target.value)} onClear={() => setMlQuery("")} placeholder="Search by name, vendor, category..." />
              <div className="w-40">
                <Select value={mlVendorFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMlVendorFilter(e.target.value)}>
                  <option value="ALL">All vendors</option>
                  {workVendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </Select>
              </div>
              <div className="w-32">
                <Select value={mlStatusFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMlStatusFilter(e.target.value)}>
                  <option value="ALL">All status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </div>
            </div>
          </TableToolbar>

          {filteredML.length === 0 ? (
            <EmptyState title="No material+labor prices" description={mlQuery ? "No prices match your search." : "Create your first material+labor price."} />
          ) : (
            <DataTable minWidth={800}>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead align="end">Price</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Status</TableHead>
                  {canManageWork && <TableHead align="end">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <tbody>
                {filteredML.map((p) => {
                  const isPending = pendingId === p.id;
                  const isArchived = p.deleted_at !== null;
                  return (
                    <TableRow key={p.id}>
                      <TableCell><TableCellContent primary={<span className="font-semibold">{p.name}</span>} /></TableCell>
                      <TableCell>{p.category.name}</TableCell>
                      <TableCell>{p.vendor.name}</TableCell>
                      <TableCell align="end"><TableCellContent primary={`${p.currency} ${Number(p.amount).toLocaleString()}`} /></TableCell>
                      <TableCell><span className="font-mono text-xs">{p.unit.code}</span></TableCell>
                      <TableCell>
                        <StatusBadge tone={isArchived ? "neutral" : "success"}>{isArchived ? "Archived" : "Active"}</StatusBadge>
                      </TableCell>
                      {canManageWork && (
                        <TableCell align="end">
                          <div className="flex items-center justify-end gap-1.5">
                            {isPending ? <Spinner /> : null}
                            {!isArchived ? (
                              <Button size="sm" variant="ghost" onClick={() => setArchiveTarget({ type: "material-labor", id: p.id, name: p.name })} disabled={isPending} title="Archive">
                                <Archive size={15} />
                              </Button>
                            ) : (
                              <>
                                <Button size="sm" variant="ghost" onClick={() => setRestoreTarget({ type: "material-labor", id: p.id, name: p.name })} disabled={isPending} title="Restore">
                                  <RotateCcw size={15} />
                                </Button>
                                <Button size="sm" variant="danger" onClick={() => setDeleteTarget({ type: "material-labor", id: p.id, name: p.name })} disabled={isPending} title="Request deletion">
                                  <Trash2 size={15} />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </tbody>
            </DataTable>
          )}
        </div>
      ),
    },
    {
      value: "labor",
      label: `Labor Only (${laborPrices.length})`,
      disabled: !canReadWork,
      content: (
        <div className="grid gap-4">
          <TableToolbar>
            <div className="flex flex-wrap items-center gap-3">
              <SearchField value={laborQuery} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLaborQuery(e.target.value)} onClear={() => setLaborQuery("")} placeholder="Search by name, vendor, category..." />
              <div className="w-40">
                <Select value={laborVendorFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLaborVendorFilter(e.target.value)}>
                  <option value="ALL">All vendors</option>
                  {workVendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </Select>
              </div>
              <div className="w-32">
                <Select value={laborStatusFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLaborStatusFilter(e.target.value)}>
                  <option value="ALL">All status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </div>
            </div>
          </TableToolbar>

          {filteredLabor.length === 0 ? (
            <EmptyState title="No labor-only prices" description={laborQuery ? "No prices match your search." : "Create your first labor-only price."} />
          ) : (
            <DataTable minWidth={700}>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead align="end">Price</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Status</TableHead>
                  {canManageWork && <TableHead align="end">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <tbody>
                {filteredLabor.map((p) => {
                  const isPending = pendingId === p.id;
                  const isArchived = p.deleted_at !== null;
                  return (
                    <TableRow key={p.id}>
                      <TableCell><TableCellContent primary={<span className="font-semibold">{p.name}</span>} /></TableCell>
                      <TableCell>{p.category.name}</TableCell>
                      <TableCell>{p.vendor.name}</TableCell>
                      <TableCell align="end"><TableCellContent primary={`${p.currency} ${Number(p.amount).toLocaleString()}`} /></TableCell>
                      <TableCell><span className="font-mono text-xs">{p.unit.code}</span></TableCell>
                      <TableCell>
                        <StatusBadge tone={isArchived ? "neutral" : "success"}>{isArchived ? "Archived" : "Active"}</StatusBadge>
                      </TableCell>
                      {canManageWork && (
                        <TableCell align="end">
                          <div className="flex items-center justify-end gap-1.5">
                            {isPending ? <Spinner /> : null}
                            {!isArchived ? (
                              <Button size="sm" variant="ghost" onClick={() => setArchiveTarget({ type: "labor", id: p.id, name: p.name })} disabled={isPending} title="Archive">
                                <Archive size={15} />
                              </Button>
                            ) : (
                              <>
                                <Button size="sm" variant="ghost" onClick={() => setRestoreTarget({ type: "labor", id: p.id, name: p.name })} disabled={isPending} title="Restore">
                                  <RotateCcw size={15} />
                                </Button>
                                <Button size="sm" variant="danger" onClick={() => setDeleteTarget({ type: "labor", id: p.id, name: p.name })} disabled={isPending} title="Request deletion">
                                  <Trash2 size={15} />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </tbody>
            </DataTable>
          )}
        </div>
      ),
    },
  ];

  return (
    <SectionCard>
      <Tabs
        items={tabs.map((t) => ({ value: t.value, label: t.label, content: t.content, disabled: t.disabled }))}
      />

      {/* Archive Confirm */}
      {archiveTarget && (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}
          title={`Archive "${archiveTarget.name}"?`}
          description="Archiving this price removes it from active pickers and price lists."
          confirmLabel="Archive"
          tone="danger"
          onConfirm={() => {
            const target = archiveTarget;
            setArchiveTarget(null);
            runRowAction(target.id, () => archivePriceAction(target.type, target.id));
          }}
        />
      )}

      {/* Restore Confirm */}
      {restoreTarget && (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setRestoreTarget(null); }}
          title={`Restore "${restoreTarget.name}"?`}
          description="Restoring this price makes it active again."
          confirmLabel="Restore"
          onConfirm={() => {
            const target = restoreTarget;
            setRestoreTarget(null);
            runRowAction(target.id, () => restorePriceAction(target.type, target.id));
          }}
        />
      )}

      {/* Request Deletion Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(28_26_24/0.36)] backdrop-blur-[2px]">
          <div className="bg-surface border border-line rounded-card shadow-elevated p-5 w-[min(calc(100%-32px),420px)]">
            <h3 className="text-lg font-semibold m-0 mb-1">Request deletion</h3>
            <p className="text-sm text-ink-secondary mb-4">Archived prices with no downstream references can be permanently purged after approval.</p>
            <input
              className="w-full border border-line rounded p-2 text-sm mb-4"
              placeholder="Reason for deletion..."
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => { setDeleteTarget(null); setDeleteReason(""); }}>Cancel</Button>
              <Button variant="danger" onClick={() => {
                const target = deleteTarget;
                setDeleteTarget(null);
                setDeleteReason("");
                runRowAction(target.id, () => requestPriceDeletionAction(target.type, target.id, deleteReason));
              }}>Submit request</Button>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
