import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBrandHashtagOptions } from "./brand-directory-options";

describe("Brand directory options", () => {
  it("suggests canonical hashtags already used by other Brands", () => {
    const options = buildBrandHashtagOptions(
      [
        { label: "Laminated", normalized: "laminated" },
        { label: "laminated", normalized: "laminated" },
        { label: "Wall Finish", normalized: "wall finish" },
      ],
      [],
    );

    assert.deepEqual(options, [
      { id: "Laminated", label: "#Laminated" },
      { id: "Wall Finish", label: "#Wall Finish" },
    ]);
  });

  it("keeps the current form value as the option identity", () => {
    const options = buildBrandHashtagOptions(
      [{ label: "Laminated", normalized: "laminated" }],
      ["laminated"],
    );

    assert.deepEqual(options, [{ id: "laminated", label: "#laminated" }]);
  });
});
