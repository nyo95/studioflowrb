import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isThemePreference, parseStoredTheme, resolveThemePreference, THEME_PREFERENCES, themeAttribute } from "./appearance";

describe("theme contract", () => {
  it("accepts exactly system, light and dark", () => {
    assert.deepEqual([...THEME_PREFERENCES].sort(), ["dark", "light", "system"]);
    for (const value of ["system", "light", "dark"]) assert.equal(isThemePreference(value), true);
    for (const value of ["", "Light", "sepia", null, undefined, 1]) assert.equal(isThemePreference(value), false);
  });

  it("reads the legacy uppercase spelling and treats anything else as not chosen", () => {
    assert.equal(parseStoredTheme("DARK"), "dark");
    assert.equal(parseStoredTheme("light"), "light");
    assert.equal(parseStoredTheme("sepia"), null);
    assert.equal(parseStoredTheme(null), null);
  });

  it("resolves own choice, then organisation default, then system", () => {
    assert.equal(resolveThemePreference("dark", "light"), "dark");
    assert.equal(resolveThemePreference("system", "dark"), "system", "choosing System is a real choice, not 'unset'");
    assert.equal(resolveThemePreference(null, "light"), "light");
    assert.equal(resolveThemePreference(null, null), "system");
  });

  it("stamps light and dark on the document, and leaves system to the operating system", () => {
    assert.equal(themeAttribute("light"), "light");
    assert.equal(themeAttribute("dark"), "dark");
    assert.equal(themeAttribute("system"), undefined);
  });
});
