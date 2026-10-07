import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/public";
import { masterDataService } from "@/apps/masterdata/runtime";
import { PageHeader } from "@/platform/ui_engine";

export default async function SamplesPage() {
  const { grants } = await requirePrincipalGrants();
  const [samples, summary] = await Promise.all([masterDataService.listSamples({ grants }), masterDataService.getSampleSummary({ grants })]);
  const canManage = hasPermission(grants, MASTERDATA_PERMISSIONS.sampleManage);
  return <><PageHeader title="Samples" divider /><p>Total {summary.total} · Available {summary.available} · Borrowed {summary.borrowed} · Sent {summary.sentToClient} · Off shelf {summary.offShelf} · Racks {summary.racks}</p>{canManage ? <p>Use the sample actions to add, move, change status, or remove a sample.</p> : null}<table><thead><tr><th>Rack</th><th>Box</th><th>SKU</th><th>Status</th><th>Holder</th><th>Quantity</th></tr></thead><tbody>{samples.map((sample) => <tr key={sample.id}><td>{sample.rack}</td><td>{sample.box}</td><td>{[sample.sku.code, sample.sku.name].filter(Boolean).join(" ")}</td><td>{sample.status}</td><td>{sample.holder_name ?? "—"}</td><td>{sample.quantity}</td></tr>)}</tbody></table></>;
}
