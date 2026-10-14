import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addDaysIso, paymentTermRows, quotationTotals, scheduleRow } from "./quotation-letter";

describe("BQ quotation letter", () => {
  it("takes PPN on the rounded subtotal, as the studio's quotation does", () => {
    const totals = quotationTotals({ subtotal: "1328889000", rounding: "1320000000", ppnPct: "11" });
    assert.equal(totals.ppn, "145200000");
    assert.equal(totals.total, "1465200000");
  });

  it("takes PPN on the subtotal without rounding, half up to whole rupiah, and allows 0%", () => {
    assert.equal(quotationTotals({ subtotal: "537113900", rounding: null, ppnPct: "11" }).ppn, "59082529");
    assert.equal(quotationTotals({ subtotal: "1000005", rounding: null, ppnPct: "10" }).ppn, "100001");
    assert.equal(quotationTotals({ subtotal: "100", rounding: null, ppnPct: "0" }).total, "100");
  });

  it("reads payment terms and the schedule as the PDF lays them out", () => {
    assert.deepEqual(paymentTermRows("50% Down Payment\n 40 %  Upon Handover\n\nRetention on handover"), [
      { share: "50%", what: "Down Payment" },
      { share: "40%", what: "Upon Handover" },
      { share: "", what: "Retention on handover" },
    ]);
    assert.deepEqual(scheduleRow("9 Weeks upon confirmation"), { lead: "9", rest: "Weeks upon confirmation" });
    assert.deepEqual(scheduleRow("Upon confirmation"), { lead: "", rest: "Upon confirmation" });
    assert.equal(addDaysIso("2026-06-19", 13), "2026-07-02");
  });
});
