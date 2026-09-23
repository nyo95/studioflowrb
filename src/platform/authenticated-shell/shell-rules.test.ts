import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSettingsMenuVisibility, isApplicationPath } from "./shell-rules";

describe("authenticated shell rules", () => {
  it("shows the rail only within an accessible application root", () => {
    const roots = ["/masterdata", "/bq"];

    assert.equal(isApplicationPath("/masterdata", roots), true);
    assert.equal(isApplicationPath("/masterdata/brands", roots), true);
    assert.equal(isApplicationPath("/bq/library", roots), true);
    assert.equal(isApplicationPath("/settings/general", roots), false);
    assert.equal(isApplicationPath("/account", roots), false);
  });

  it("shows the account menu's Settings entry for any settings-canvas read permission", () => {
    assert.deepEqual(getSettingsMenuVisibility(["platform.settings.read"]), { showSettings: true });
    assert.deepEqual(getSettingsMenuVisibility(["platform.user.read"]), { showSettings: true });
    assert.deepEqual(getSettingsMenuVisibility(["platform.role.read"]), { showSettings: true });
    assert.deepEqual(getSettingsMenuVisibility([]), { showSettings: false });
  });
});
