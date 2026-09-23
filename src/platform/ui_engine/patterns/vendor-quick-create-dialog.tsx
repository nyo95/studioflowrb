"use client";

import { Button } from "../primitives/actions";
import { Input, Select } from "../primitives/forms";
import { Field, FormActions } from "../components/forms";
import { DraftDialog } from "./draft-dialog";

export type VendorTypeOption = { id: string; name: string };

/**
 * One shared "quick-create a supplier" affordance, used identically from
 * every entry point that can spawn a Vendor inline (Brand's owner-supplier
 * field, Brand's Suppliers field, Pricing's supplier field) so they share a
 * single minimum-field bar: name + at least one Supplier Type. A vendor
 * created with no type is invisible to every price picker until someone
 * manually assigns one later, so this dialog never lets that happen.
 */
export function VendorQuickCreateDialog({
  open,
  pending,
  error,
  name,
  onNameChange,
  vendorTypeId,
  onVendorTypeIdChange,
  vendorTypes,
  onSubmit,
  onCancel,
  title = "Add supplier",
  description = "Create a supplier without leaving this form.",
  requireVendorType = true,
}: {
  open: boolean;
  pending: boolean;
  error: string | null;
  name: string;
  onNameChange: (value: string) => void;
  vendorTypeId: string;
  onVendorTypeIdChange: (value: string) => void;
  vendorTypes: readonly VendorTypeOption[];
  onSubmit: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
  /** False for a pure-label relation (Brand's owner field) that never implies
   * a price-picker capability. True (default) for any Vendor meant to supply
   * — it must carry at least one Supplier Type or it's invisible to pickers. */
  requireVendorType?: boolean;
}) {
  if (!open) return null;
  return (
    <DraftDialog open pending={pending} onOpenChange={(next) => !next && onCancel()} title={title} description={description}>
      <div className="grid gap-4">
        {error ? <div role="alert" className="text-sm text-danger">{error}</div> : null}
        <Field label="Supplier name" required><Input value={name} onChange={(event) => onNameChange(event.target.value)} required autoFocus /></Field>
        <Field label="Supplier type" required={requireVendorType}>
          <Select value={vendorTypeId} onChange={(event) => onVendorTypeIdChange(event.target.value)} required={requireVendorType}>
            <option value="">{requireVendorType ? "Select supplier type" : "Select supplier type (optional)"}</option>
            {vendorTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </Select>
        </Field>
        {requireVendorType && vendorTypes.length === 0 ? <div role="alert" className="text-sm text-danger">No active Supplier Type is available. Ask an administrator to configure one first.</div> : null}
        <FormActions>
          <Button data-dialog-cancel type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="button" variant="primary" disabled={pending || !name.trim() || (requireVendorType && (!vendorTypeId || vendorTypes.length === 0))} onClick={onSubmit}>{pending ? "Adding…" : "Add supplier"}</Button>
        </FormActions>
      </div>
    </DraftDialog>
  );
}
