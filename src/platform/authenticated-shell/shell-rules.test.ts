import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSettingsMenuVisibility, isApplicationPath, isRailPath } from "./shell-rules";

describe("authenticated shell rules", () => {
  it("shows the rail only within an accessible application root", () => {
    const roots = ["/masterdata", "/bq"];

    assert.equal(isApplicationPath("/masterdata", roots), true);
    assert.equal(isApplicationPath("/masterdata/brands", roots), true);
    assert.equal(isApplicationPath("/bq/library", roots), true);
    assert.equal(isApplicationPath("/settings/general", roots), false);
    assert.equal(isApplicationPath("/account", roots), false);
  });

  it("keeps the same rail on platform settings and My preferences, but not on the launcher", () => {
    const roots = ["/masterdata", "/studioflow"];
    assert.equal(isRailPath("/studioflow/settings/phases", roots), true);
    assert.equal(isRailPath("/settings/general", roots), true);
    assert.equal(isRailPath("/settings", roots), true);
    assert.equal(isRailPath("/account", roots), true);
    assert.equal(isRailPath("/", roots), false);
    assert.equal(isRailPath("/settingsx", roots), false);
  });

  it("shows the Platform settings entry for any platform-settings read permission, never for app permissions alone", () => {
    assert.deepEqual(getSettingsMenuVisibility(["platform.settings.read"]), { showSettings: true });
    assert.deepEqual(getSettingsMenuVisibility(["platform.user.read"]), { showSettings: true });
    assert.deepEqual(getSettingsMenuVisibility(["platform.role.read"]), { showSettings: true });
    assert.deepEqual(getSettingsMenuVisibility([]), { showSettings: false });
    assert.deepEqual(getSettingsMenuVisibility(["studioflow.settings.manage", "masterdata.dictionary.manage"]), { showSettings: false });
  });
});
