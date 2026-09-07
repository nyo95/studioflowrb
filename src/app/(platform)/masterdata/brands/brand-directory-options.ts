type HashtagSource = {
  label: string;
  normalized: string;
};

type HashtagOption = {
  id: string;
  label: string;
};

function hashtagKey(value: string): string {
  return value.trim().replace(/^#+/, "").replace(/\s+/g, " ").toLowerCase();
}

export function buildBrandHashtagOptions(
  suggestions: readonly HashtagSource[],
  selected: readonly string[],
): HashtagOption[] {
  const byNormalized = new Map<string, HashtagOption>();

  for (const value of selected) {
    const clean = value.trim().replace(/^#+/, "");
    const normalized = hashtagKey(clean);
    if (normalized) byNormalized.set(normalized, { id: clean, label: `#${clean}` });
  }

  for (const suggestion of suggestions) {
    const clean = suggestion.label.trim().replace(/^#+/, "");
    const normalized = suggestion.normalized || hashtagKey(clean);
    if (normalized && !byNormalized.has(normalized)) {
      byNormalized.set(normalized, { id: clean, label: `#${clean}` });
    }
  }

  return [...byNormalized.values()].sort((left, right) =>
    left.label.localeCompare(right.label, undefined, { sensitivity: "base" }),
  );
}
