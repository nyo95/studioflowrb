import Link from "next/link";
import { FolderTree } from "lucide-react";

import { categoryService } from "@/apps/masterdata/infrastructure/runtime";
import { requireMasterDataRequestContext } from "@/apps/masterdata/infrastructure/request-context";
import {
  Badge,
  Button,
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
  buttonClasses,
} from "@/platform/ui_engine";

import { deleteCategoryAction, restoreCategoryAction } from "./actions";
import { SortableTableHead } from "../sortable-table-head";


export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const kind = sp["kind"] === "WORK" ? ("WORK" as const) : ("PRODUCT" as const);
  const showDeleted = sp["deleted"] === "1";

  const sort = typeof sp["sort"] === "string" ? sp["sort"] : "name"; const direction = sp["dir"] === "desc" ? -1 : 1;
  const categories = (await categoryService.list((await requireMasterDataRequestContext()), {
    kind,
    includeDeleted: showDeleted,
  })).toSorted((a, b) => direction * String(sort === "path" ? a.path ?? a.slug : sort === "status" ? Boolean(a.deletedAt) : sort === "order" ? a.sortOrder : a.name).localeCompare(String(sort === "path" ? b.path ?? b.slug : sort === "status" ? Boolean(b.deletedAt) : sort === "order" ? b.sortOrder : b.name), "id-ID", { numeric: true }));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Master Data"
        title="Categories"
        description="Manage PRODUCT and WORK category dictionaries."
        actions={
          <Link
            href={`/masterdata/categories/new?kind=${kind}`}
            className={buttonClasses("primary", "md")}
          >
            <span>New category</span>
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href="/masterdata/categories?kind=PRODUCT" className={buttonClasses(kind === "PRODUCT" ? "primary" : "secondary", "sm")}><span>PRODUCT</span></Link>
        <Link href="/masterdata/categories?kind=WORK" className={buttonClasses(kind === "WORK" ? "primary" : "secondary", "sm")}><span>WORK</span></Link>
        <Link href={`/masterdata/categories?kind=${kind}${showDeleted ? "" : "&deleted=1"}`} className={buttonClasses("secondary", "sm")}>
          <span>{showDeleted ? "Hide archived" : "Show archived"}</span>
        </Link>
      </div>

      <DataTable>
        <TableHeader>
          <TableRow>
            <SortableTableHead column="name">Name</SortableTableHead>
            <SortableTableHead column="path">Path / Slug</SortableTableHead>
            <SortableTableHead column="status">Status</SortableTableHead>
            <SortableTableHead column="order">Sort</SortableTableHead>
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
                  <div className="flex flex-wrap items-center gap-2">
                    {!cat.deletedAt && (
                      <Link href={`/masterdata/categories/${cat.id}/edit`} className={buttonClasses("ghost", "sm")}><span>Edit</span></Link>
                    )}
                    {cat.deletedAt ? (
                      <form action={restoreCategoryAction.bind(null, cat.id)}>
                        <Button type="submit" variant="ghost" size="sm">Restore</Button>
                      </form>
                    ) : (
                      <form action={deleteCategoryAction.bind(null, cat.id)}>
                        <Button type="submit" variant="danger" size="sm">Archive</Button>
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
