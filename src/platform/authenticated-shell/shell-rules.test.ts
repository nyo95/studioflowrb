import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAdministrationMenuVisibility, isApplicationPath } from "./shell-rules";

describe("authenticated shell rules", () => {
  it("shows the rail only within an accessible application root", () => {
    const roots = ["/masterdata", "/bq"];

    assert.equal(isApplicationPath("/masterdata", roots), true);
    assert.equal(isApplicationPath("/masterdata/brands", roots), true);
    assert.equal(isApplicationPath("/bq/library", roots), true);
    assert.equal(isApplicationPath("/settings/general", roots), false);
    assert.equal(isApplicationPath("/account", roots), false);
  });

  it("uses read permissions for each administration destination", () => {
    assert.deepEqual(getAdministrationMenuVisibility(["platform.settings.read"]), {
      showAdministration: true,
      showGeneralSettings: true,
      showUsers: false,
      showRoles: false,
    });
    assert.deepEqual(getAdministrationMenuVisibility(["platform.user.read"]), {
      showAdministration: true,
      showGeneralSettings: false,
      showUsers: true,
      showRoles: false,
    });
    assert.deepEqual(getAdministrationMenuVisibility([]), {
      showAdministration: false,
      showGeneralSettings: false,
      showUsers: false,
      showRoles: false,
    });
  });
});
