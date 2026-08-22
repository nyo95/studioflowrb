import { normalizeText } from "../normalization";

export function toSlug(value: string) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
