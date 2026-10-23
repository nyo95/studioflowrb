"use client";

import { History } from "lucide-react";
import { useState } from "react";
import { specLine, type ScheduleExtraField } from "@/apps/studioflow/domain/schedule";
import {
  Button,
  CreatableSearch,
  Drawer,
  Field,
  FilterChip,
  ImageWorkspace,
  InlineError,
  Input,
  SimpleTextEditor,
  Text,
  useConfirm,
  type CreatableSearchOption,
} from "@/platform/ui_engine";
import {
  copyReusableScheduleOptionAction,
  createScheduleEntryAction,
  createScheduleOptionAction,
  setScheduleOptionImageAction,
  } from "../../../actions";
import { ExtraFieldsEditor } from "../../../_components/extra-fields-editor";
import { ReuseSearch } from "./schedule-reuse";
import { type Brand, type CategoryChoice, categoryGroups, type Command, EMPTY_PRODUCT, Footer, PHOTO_ASPECT, type ProductDraft, type ReuseHit, type Section, toSnapshot } from "./schedule-shared";

export function AddItemDrawer({ projectId, section, categoriesBySection, categoryChoices, brands, command, confirm, onClose }: { projectId: string; section: Section; categoriesBySection: Record<Section, string[]>; categoryChoices: readonly CategoryChoice[]; brands: readonly Brand[]; command: Command; confirm: ReturnType<typeof useConfirm>["confirm"]; onClose: () => void }) {
  const [targetSection, setTargetSection] = useState<Section>(section);
  // Categories belong to a section: Material and Fixture number separately, so switching the section
  // switches the list and never carries a Material category into a Fixture row.
  const categories = categoriesBySection[targetSection];
  const [category, setCategory] = useState(categories[0] ?? "");
  const switchSection = (next: Section) => {
    if (next === targetSection) return;
    setTargetSection(next);
    setCategory(categoriesBySection[next][0] ?? "");
  };
  const [product, setProduct] = useState<ProductDraft>(EMPTY_PRODUCT);
  const [qty, setQty] = useState({ qty: "", unit: "", location: "" });
  const [preparedPhoto, setPreparedPhoto] = useState<File | null>(null);
  // A product picked from another project: Save copies it whole (photo and notes included), so the product fields give way to a summary.
  const [reuseHit, setReuseHit] = useState<ReuseHit | null>(null);
  const [searchingPast, setSearchingPast] = useState(false);
  const isFixture = targetSection === "FIXTURE";
  const pending = command.isPending("add-item");
  const hasProduct = reuseHit !== null || preparedPhoto !== null || Object.entries(product).some(([key, value]) => key === "extra" ? (value as ScheduleExtraField[]).length > 0 : String(value).trim().length > 0);
  const canSave = Boolean(category.trim()) && (!hasProduct || reuseHit !== null || Boolean(product.productName.trim()));
  const pickReuse = (hit: ReuseHit) => {
    setTargetSection(hit.section);
    setCategory(hit.category);
    setProduct(EMPTY_PRODUCT);
    setPreparedPhoto(null);
    setReuseHit(hit);
    setSearchingPast(false);
  };
  const setProductField = (key: keyof ProductDraft) => (event: { target: { value: string } }) => setProduct({ ...product, [key]: event.target.value });
  const brandOptions: CreatableSearchOption[] = [
    ...brands.map((brand) => ({ id: brand.id, label: brand.name })),
    ...(!product.brandId && product.brandName.trim() ? [{ id: product.brandName, label: product.brandName, description: "Typed — not in Master Data" }] : []),
  ];
  const isDirty = targetSection !== section || category !== (categoriesBySection[section][0] ?? "") || hasProduct || Object.values(qty).some(Boolean) || preparedPhoto !== null;

  const requestClose = async () => {
    if (isDirty) {
      const ok = await confirm({ title: "Discard changes?", description: "This new item has not been saved.", confirmLabel: "Discard changes", cancelLabel: "Keep editing", tone: "danger" });
      if (!ok) return;
    }
    onClose();
  };

  const save = async () => {
    let entryId: string | null = null;
    let optionId: string | null = null;
    const ok = await command.run("add-item", () => createScheduleEntryAction({
      projectId,
      section: targetSection,
      category: category.trim(),
      // Qty and unit only exist for Fixture: a Material line is specified, not counted.
      qty: isFixture ? qty.qty.trim() || null : null,
      unit: isFixture ? qty.unit.trim() || null : null,
      location: qty.location.trim() || null,
      snapshot: null,
    }), (data) => { if (data && typeof data === "object" && "entryId" in data && typeof data.entryId === "string") entryId = data.entryId; });
    if (!ok || !entryId) return;
    if (reuseHit) {
      const reuseOk = await command.run("add-item-option", () => copyReusableScheduleOptionAction({ projectId, entryId: entryId!, sourceOptionId: reuseHit.optionId }));
      if (!reuseOk) return;
    } else if (hasProduct) {
      const optionOk = await command.run("add-item-option", () => createScheduleOptionAction({ projectId, entryId: entryId!, snapshot: toSnapshot(product) }), (data) => { if (data && typeof data === "object" && "optionId" in data && typeof data.optionId === "string") optionId = data.optionId; });
      if (!optionOk) return;
    }
    if (preparedPhoto && optionId) {
      const form = new FormData(); form.set("projectId", projectId); form.set("optionId", optionId); form.set("file", preparedPhoto);
      const photoOk = await command.run("add-item-photo", () => setScheduleOptionImageAction(form));
      if (!photoOk) return;
    }
    if (ok) onClose();
  };

  return (
    <Drawer
      open
      onOpenChange={(value) => { if (!value) void requestClose(); }}
      title="Add item"
      description="It gets a code from the category, like PT-03. A new category gets its own code letters."
      size="lg"
      dismissible={!pending}
      footer={<Footer><Button variant="ghost" onClick={() => void requestClose()} disabled={pending}>Discard</Button><Button variant="primary" pending={pending || command.isPending("add-item-option") || command.isPending("add-item-fields") || command.isPending("add-item-photo")} disabled={!canSave} onClick={save}>Save item</Button></Footer>}
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Section">
          <FilterChip selected={targetSection === "MATERIAL"} onClick={() => switchSection("MATERIAL")}>Material</FilterChip>
          <FilterChip selected={targetSection === "FIXTURE"} onClick={() => switchSection("FIXTURE")}>Fixture</FilterChip>
        </div>
        <div className="grid gap-3">
          <Field label="Category" required>
            <CreatableSearch
              key={targetSection}
              label="Category"
              groups={categoryGroups(categories, categoryChoices, targetSection, "In this project", false)}
              value={category}
              onValueChange={setCategory}
              onCreate={(name) => name.trim()}
              createLabel={(name) => `New category “${name}”`}
              placeholder="Pick or type a category, e.g. Paint"
              searchPlaceholder="Search categories…"
              emptyLabel="No category yet. Type a new one."
              className="w-full"
            />
          </Field>
        </div>
        <div className="grid gap-3 rounded-control border border-line-subtle bg-surface-muted p-3">
          <div className="flex items-start justify-between gap-2">
            <div><Text weight="semibold">From a past project</Text><Text size="sm" tone="tertiary">Start from a product another project already uses. It is copied, so the other project never changes.</Text></div>
            {!reuseHit ? <Button size="sm" variant="secondary" leadingIcon={<History className="h-3.5 w-3.5" />} onClick={() => setSearchingPast(!searchingPast)} disabled={pending}>{searchingPast ? "Close" : "Search"}</Button> : null}
          </div>
          {reuseHit ? (
            <div className="flex items-center gap-3 rounded-control border border-line bg-surface px-3 py-2">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-sm font-medium">{reuseHit.productName}{reuseHit.brandName ? <span className="font-normal text-ink-secondary"> · ex. {reuseHit.brandName}</span> : null}</span>
                <span className="truncate text-xs text-ink-tertiary">{[specLine(reuseHit), `${reuseHit.sourceProjectName} · ${reuseHit.category}`].filter(Boolean).join(" — ")}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setReuseHit(null)} disabled={pending}>Remove</Button>
            </div>
          ) : null}
          {searchingPast && !reuseHit ? <ReuseSearch projectId={projectId} useLabel="Use as start" onUse={pickReuse} /> : null}
        </div>
        {reuseHit ? (
          <div className="grid gap-3 border-t border-line-subtle pt-4">
            <Text weight="semibold">Item details</Text>
            <Text size="sm" tone="tertiary">The product, photo and notes come from the past project. Edit them on the card after saving.</Text>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Location"><Input value={qty.location} onChange={(event) => setQty({ ...qty, location: event.target.value })} maxLength={160} /></Field>
              {isFixture ? <Field label="Qty and unit"><div className="grid grid-cols-2 gap-2"><Input aria-label="Qty" inputMode="decimal" value={qty.qty} onChange={(event) => setQty({ ...qty, qty: event.target.value })} maxLength={20} /><Input aria-label="Unit" value={qty.unit} onChange={(event) => setQty({ ...qty, unit: event.target.value })} maxLength={40} placeholder="Unit" /></div></Field> : null}
            </div>
          </div>
        ) : (
        <div className="grid gap-3 border-t border-line-subtle pt-4">
          <Text weight="semibold">Product</Text>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type"><Input value={product.productName} onChange={setProductField("productName")} maxLength={200} placeholder="Type, or leave every product field empty to reserve" /></Field>
            <Field label="Brand"><CreatableSearch label="Brand" options={brandOptions} value={product.brandId || product.brandName} onValueChange={(next) => setProduct(brands.some((brand) => brand.id === next) ? { ...product, brandId: next, brandName: "" } : { ...product, brandId: "", brandName: next })} onCreate={(text) => text} createLabel={(text) => `Use "${text}" (not in Master Data)`} placeholder="Pick or type a brand" searchPlaceholder="Search brands…" emptyLabel="No brands found" allowClear className="w-full" /></Field>
            <Field label="Color"><Input value={product.color} onChange={setProductField("color")} maxLength={160} /></Field>
            <Field label="Pattern"><Input value={product.pattern} onChange={setProductField("pattern")} maxLength={160} /></Field>
            <Field label="Finishing"><Input value={product.finishing} onChange={setProductField("finishing")} maxLength={160} /></Field>
            <Field label="Size"><Input value={product.dimension} onChange={setProductField("dimension")} maxLength={160} /></Field>
            <Field label="Location"><Input value={qty.location} onChange={(event) => setQty({ ...qty, location: event.target.value })} maxLength={160} /></Field>
            {isFixture ? <Field label="Qty"><div className="grid grid-cols-2 gap-2"><Input aria-label="Qty" inputMode="decimal" value={qty.qty} onChange={(event) => setQty({ ...qty, qty: event.target.value })} maxLength={20} /><Input aria-label="Unit" value={qty.unit} onChange={(event) => setQty({ ...qty, unit: event.target.value })} maxLength={40} placeholder="Unit" /></div></Field> : null}
          </div>
          <ExtraFieldsEditor value={product.extra} onChange={(extra) => setProduct({ ...product, extra })} />
          <Field label="Notes"><SimpleTextEditor value={product.notes} onChange={(event) => setProduct({ ...product, notes: event.target.value })} maxLength={2000} rows={3} /></Field>
          <div className="grid gap-2"><Text weight="semibold">Photo</Text><ImageWorkspace label="Schedule option photo" aspect={PHOTO_ASPECT} maxDimension={1600} outputType="image/jpeg" allowColor onPrepared={setPreparedPhoto} disabled={pending} />{preparedPhoto ? <Text size="sm" tone="secondary">Photo ready: {preparedPhoto.name}</Text> : null}</div>
        </div>
        )}
        {hasProduct && !reuseHit && !product.productName.trim() ? <InlineError>Enter a Type, or clear the product fields to only reserve the code.</InlineError> : null}
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Drawer>
  );
}
