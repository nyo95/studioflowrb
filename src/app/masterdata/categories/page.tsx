import Link from "next/link";
import { FolderTree } from "lucide-react";

import { categoryService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/application/masterdata-permissions";
import {
  Badge,
  DataTable,
  EmptyState,
  PageHeader,
  PageShell,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from "@/platform/ui_engine";

import { deleteCategoryAction, restoreCategoryAction } from "./actions";

const DEV_CONTEXT = {
  grants: [...MASTERDATA_PERMISSIONS] as string[],
  actor: { kind: "SYSTEM" as const, label: "Dev session" },
};

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const kind = sp["kind"] === "WORK" ? ("WORK" as const) : ("PRODUCT" as const);
  const showDeleted = sp["deleted"] === "1";

  const categories = await categoryService.list(DEV_CONTEXT, {
    kind,
    includeDeleted: showDeleted,
  });

  return (
    <PageShell>
      <PageHeader
        eyebrow="Master Data"
        title="Categories"
        description="Manage PRODUCT and WORK category dictionaries."
        actions={
          <Link
            href={`/masterdata/categories/new?kind=${kind}`}
            className="ui-button"
            data-variant="primary"
            data-size="md"
          >
            <span>New category</span>
          </Link>
        }
      />

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <Link href="/masterdata/categories?kind=PRODUCT" className="ui-button" data-variant={kind === "PRODUCT" ? "primary" : "secondary"} data-size="sm"><span>PRODUCT</span></Link>
        <Link href="/masterdata/categories?kind=WORK" className="ui-button" data-variant={kind === "WORK" ? "primary" : "secondary"} data-size="sm"><span>WORK</span></Link>
        <Link href={`/masterdata/categories?kind=${kind}${showDeleted ? "" : "&deleted=1"}`} className="ui-button" data-variant="secondary" data-size="sm">
          <span>{showDeleted ? "Hide archived" : "Show archived"}</span>
        </Link>
      </div>

      <DataTable>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Path / Slug</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Sort</TableHead>
            <TableHead aria-label="Actions" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>
                <EmptyState icon={FolderTree} title="No categories" />
              </TableCell>
            </TableRow>
          ) : (
            categories.map((cat) => (
              <TableRow key={cat.id}>
                <TableCell>
                  <TableCellContent primary={cat.name} secondary={cat.slug} />
                </TableCell>
                <TableCell>
                  <Text as="span" tone="secondary" size="sm">{cat.path ?? cat.slug}</Text>
                </TableCell>
                <TableCell>
                  <Badge tone={cat.deletedAt ? "warning" : "success"}>
                    {cat.deletedAt ? "Archived" : "Active"}
                  </Badge>
                </TableCell>
                <TableCell>{cat.sortOrder}</TableCell>
                <TableCell>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {!cat.deletedAt && (
                      <Link href={`/masterdata/categories/${cat.id}/edit`} className="ui-button" data-variant="ghost" data-size="sm"><span>Edit</span></Link>
                    )}
                    {cat.deletedAt ? (
                      <form action={restoreCategoryAction.bind(null, cat.id)}>
                        <button type="submit" className="ui-button" data-variant="ghost" data-size="sm"><span>Restore</span></button>
                      </form>
                    ) : (
                      <form action={deleteCategoryAction.bind(null, cat.id)}>
                        <button type="submit" className="ui-button" data-variant="danger" data-size="sm"><span>Archive</span></button>
                      </form>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>
    </PageShell>
  );
}
