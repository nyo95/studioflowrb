import { toSlug } from "@platform/utilities/slug";

export const categorySlug = toSlug;

export function buildCategoryPath(parentPath: string | null | undefined, name: string): string {
  const own = categorySlug(name);
  const parent = parentPath?.trim();
  return parent ? `${parent}/${own}` : own;
}

export function splitCategoryInput(value: string): { parent: string | null; child: string } {
  const parts = value.split(/[>/]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return { parent: null, child: "" };
  if (parts.length === 1) return { parent: null, child: parts[0] };
  return { parent: parts.at(-2) ?? null, child: parts.at(-1) ?? "" };
}
