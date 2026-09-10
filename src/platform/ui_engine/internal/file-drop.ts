/**
 * Drop-selection rules for the shared file drop zone, kept free of React and
 * the DOM so the behavior can be asserted directly instead of inferred from
 * rendered markup.
 *
 * The zone decides which files one gesture yields. It decides nothing about
 * what a file means, where it is stored, or whether a server will accept it:
 * that policy stays with the consuming application.
 */

/** The subset of the platform `File` shape the zone reads. Bytes are never touched. */
export type FileDescriptor = {
  name: string;
  size: number;
  type: string;
};

/**
 * Native `accept` semantics, so a zone and its underlying picker agree on what
 * a drop may contain: an empty list accepts everything, `.ext` matches the
 * filename suffix, `type/*` matches the media-type group, and any other token
 * must match the media type exactly. Matching is case-insensitive because both
 * filename suffixes and media types are.
 */
export function matchesAccept(accept: string | undefined, file: FileDescriptor): boolean {
  const tokens = (accept ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) return true;

  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  return tokens.some((token) => {
    if (token === "*" || token === "*/*") return true;
    if (token.startsWith(".")) return name.endsWith(token);
    // "image/*" keeps its trailing slash so "image/png" matches but "imagex" does not.
    if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

export type SelectFilesOptions = {
  accept?: string;
  multiple?: boolean;
};

/**
 * Normalizes one drop or one picker change into the files a consumer should
 * see. A single-select zone yields at most one file, so a stray multi-file
 * drop cannot quietly hand a consumer more than it asked for.
 */
export function selectFiles(
  files: readonly FileDescriptor[],
  { accept, multiple = false }: SelectFilesOptions = {},
): FileDescriptor[] {
  const allowed = files
    .filter((file) => matchesAccept(accept, file))
    // Copied to plain records: a consumer must not retain a live platform
    // handle it could later read bytes from by accident.
    .map((file) => ({ name: file.name, size: file.size, type: file.type }));
  return multiple ? allowed : allowed.slice(0, 1);
}
