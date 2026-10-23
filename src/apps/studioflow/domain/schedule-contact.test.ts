import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatScheduleContact } from "./schedule";

describe("formatScheduleContact", () => {
  it("adds title and first phone only when present", () => {
    assert.equal(formatScheduleContact({ personName: " Andi ", jobTitle: " Sales ", phone: " 0813412457877 " }), "Andi (Sales) - 0813412457877");
    assert.equal(formatScheduleContact({ personName: " Budi ", jobTitle: null, phone: " 0812 " }), "Budi - 0812");
    assert.equal(formatScheduleContact({ personName: " Citra ", jobTitle: " Admin ", phone: null }), "Citra (Admin)");
  });

  it("caps the saved text at 160 characters", () => {
    const label = formatScheduleContact({ personName: "A".repeat(155), jobTitle: "Sales", phone: "0812" });
    assert.equal(label.length, 160);
    assert.equal(label, `${"A".repeat(155)} (Sal`);
  });
});
