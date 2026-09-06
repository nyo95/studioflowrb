"use client";
import { EntityPrimaryCell, RowActionMenu } from "@/platform/ui_engine";
import { DraftDialog } from "@/platform/ui_engine";

import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";

import { Pagination,Text,usePagination } from "@/platform/ui_engine";

import { DirectoryShell } from "@/platform/ui_engine";


import { useState,useTransition } from "react";

import { Archive,Plus,RotateCcw,Trash2 } from "lucide-react";

import { Button,ConfirmDialog,DataTable,EmptyState,Field,FormActions,InlineError,Input,SearchField,Spinner,TableBody,TableCell,TableCellContent,TableHead,TableHeader,TableRow,TableToolbar } from "@/platform/ui_engine";

import { archiveVendorTypeAction,requestVendorTypeDeletionAction,restoreVendorTypeAction,saveVendorTypeAction } from "./vendor-types-actions";

type Row = { id: string; code: string; name: string; can_supply_material: boolean; can_supply_labor: boolean; deleted_at: Date | null; _count: { vendor_types: number } };
export function VendorTypeDirectory({ rows, canManage }: { rows: Row[]; canManage: boolean }) {
 const [rowError, setRowError] = useState<string | null>(null);
 const [query,setQuery]=useState(""); const [edit,setEdit]=useState<Row|null>(null); const [remove,setRemove]=useState<Row|null>(null); const [pending,setPending]=useState<string|null>(null); const [error,setError]=useState<string|null>(null); const [,startTransition]=useTransition(); const filtered=rows.filter((r)=>`${r.code} ${r.name}`.toLowerCase().includes(query.toLowerCase()));
  const { locale } = useDisplaySettings();
  const [sortKey, setSortKey] = useState<"Type">("Type");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const sortValues: Record<"Type", (r: Row) => string | number | null> = {"Type": (r) => r.name};
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const orderedRows = [...filtered].sort((a, b) => {
    const left = sortValues[sortKey](a), right = sortValues[sortKey](b);
    if (left === null || right === null) return left === right ? a.id.localeCompare(b.id) : left === null ? 1 : -1;
    const result = typeof left === "number" && typeof right === "number" ? left - right : collator.compare(String(left), String(right));
    return (sortDirection === "asc" ? result : -result) || a.id.localeCompare(b.id);
  });
  const paging = usePagination(orderedRows.length, 25, JSON.stringify([query, sortKey, sortDirection]));
  const visibleRows = orderedRows.slice(paging.offset, paging.offset + 25);
  const pageFooter = <div className="grid gap-2"><Text tone="secondary" size="sm">{orderedRows.length ? paging.offset + 1 : 0}–{Math.min(paging.offset + 25, orderedRows.length)} of {orderedRows.length} records</Text>{paging.pageCount > 1 ? <Pagination page={paging.page} pageCount={paging.pageCount} onPageChange={paging.setPage} /> : null}</div>;
 const run=(id: string, command: () => Promise<unknown>, onSuccess?: () => void) => {
    if (pending) return;
    setPending(id); setRowError(null);
    startTransition(async () => {
      try {
        const result = await command();
        if (result && typeof result === "object" && "ok" in result && !result.ok) {
          const failure = result as { error?: { safeMessage?: string } };
          setRowError(failure.error?.safeMessage ?? "The action could not be completed."); return;
        }
        onSuccess?.();
      } catch { setRowError("The action could not be completed. Please try again."); }
      finally { setPending(null); }
    });
  };
 return <DirectoryShell fill header={rowError ? <InlineError>{rowError}</InlineError> : undefined} surface pagination={pageFooter} toolbar={<TableToolbar framed={false} actions={canManage ? (<Button leadingIcon={<Plus />} variant="primary" onClick={()=>setEdit({id:"",code:"",name:"",can_supply_material:false,can_supply_labor:false,deleted_at:null,_count:{vendor_types:0}})}>New type</Button>) : undefined}><SearchField value={query} onChange={(e)=>setQuery(e.target.value)} onClear={()=>setQuery("")} placeholder="Search supplier types..." /></TableToolbar>}>{filtered.length===0?<EmptyState title="No supplier types" description={query ? "No supplier types match your search." : "Add your first supplier type."}  />:<DataTable framed={false} density="compact" stickyHeader fill minWidth={620}><TableHeader><TableRow><TableHead sortable sortDirection={sortKey === "Type" ? sortDirection : null} onSortChange={(direction) => { setSortKey("Type"); setSortDirection(direction); }}>Type</TableHead><TableHead>Capabilities</TableHead><TableHead align="end">Assigned suppliers</TableHead>{canManage?<TableHead stickyEnd align="end">Actions</TableHead>:null}</TableRow></TableHeader><TableBody>{visibleRows.map((row)=><TableRow key={row.id}><TableCell><EntityPrimaryCell tone={row.deleted_at ? "danger" : "success"} statusLabel={row.deleted_at ? "Archived" : "Active"} name={row.name} secondary={<span className="font-ui-mono">{row.code}</span>} /></TableCell><TableCell>{[row.can_supply_material&&"Material",row.can_supply_labor&&"Labor"].filter(Boolean).join(", ")||"None"}</TableCell><TableCell align="end"><TableCellContent align="end" primary={row._count.vendor_types.toLocaleString()} /></TableCell>{canManage?<TableCell align="end" stickyEnd><RowActionMenu label={`Actions for ${row.name}`} pending={pending === row.id} items={!row.deleted_at ? [{label:"Edit",onSelect:()=>setEdit(row)},{label:"Archive",danger:true,separatorBefore:true,onSelect:()=>run(row.id,()=>archiveVendorTypeAction(row.id))}] : [{label:"Restore",onSelect:()=>run(row.id,()=>restoreVendorTypeAction(row.id))},{label:"Request deletion",danger:true,separatorBefore:true,onSelect:()=>setRemove(row)}]} /></TableCell>:null}</TableRow>)}</TableBody></DataTable>}{edit?<DraftDialog open onOpenChange={(open)=>!open&&setEdit(null)} title={edit.id?`Edit ${edit.name}`:"Create supplier type"} description="Capabilities determine which pricing workflows a Supplier can serve."><form className="grid gap-4" onSubmit={async(e)=>{e.preventDefault();setError(null);const result=await saveVendorTypeAction(edit.id||null,new FormData(e.currentTarget));if(result.ok)setEdit(null);else setError(result.error.safeMessage)}}>{error?<InlineError>{error}</InlineError>:null}<Field label="Code" required><Input name="code" defaultValue={edit.code} disabled={Boolean(edit.id)} required onInput={(e)=>{e.currentTarget.value=e.currentTarget.value.toUpperCase()}} /></Field><Field label="Name" required><Input name="name" defaultValue={edit.name} required /></Field><label><input name="material" type="checkbox" defaultChecked={edit.can_supply_material}/> Can supply material</label><label><input name="labor" type="checkbox" defaultChecked={edit.can_supply_labor}/> Can supply labor</label><FormActions><Button data-dialog-cancel variant="ghost" onClick={()=>setEdit(null)}>Cancel</Button><Button type="submit" variant="primary">Save type</Button></FormActions></form></DraftDialog>:null}{remove?<ConfirmDialog error={rowError} pending={pending !== null} open onOpenChange={(open)=>!open&&setRemove(null)} title={`Request deletion of ${remove.name}?`} description="The archived type remains protected until a deletion approver accepts the request." confirmLabel="Submit request" tone="danger" onConfirm={()=>{const row=remove;run(row.id,()=>requestVendorTypeDeletionAction(row.id), () => { setRemove(null); })}}/>:null}</DirectoryShell>;
}
