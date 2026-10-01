/**
 * Domain-neutral text-case helpers. They only change letter case and whitespace, never meaning.
 *
 * - `titleCaseWords`: the first letter of every whitespace-separated word becomes upper case; every other character
 *   is left exactly as typed ("MEP", "PT", "60x60" and "anti-slip" keep their shape, "pasang keramik" becomes
 *   "Pasang Keramik"). Whitespace is trimmed and collapsed.
 * - `lowerCaseText`: whitespace trimmed and collapsed, everything lower case (units, tags).
 */

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function titleCaseWords(value: string): string {
  return collapse(value)
    .split(" ")
    .map((word) => {
      if (!word) return word;
      const [first, ...rest] = Array.from(word);
      return first!.toLocaleUpperCase() + rest.join("");
    })
    .join(" ");
}

export function lowerCaseText(value: string): string {
  return collapse(value).toLocaleLowerCase();
}
