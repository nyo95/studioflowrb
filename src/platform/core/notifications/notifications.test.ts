import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NOTIFICATION_BODY_MAX, NOTIFICATION_RECIPIENTS_MAX, NOTIFICATION_TITLE_MAX, isSafeInternalHref, prepareNotification, type NotificationInput } from "./index";

const base: NotificationInput = {
  recipientUserIds: ["u1"],
  appId: "masterdata",
  kind: "masterdata.sample-request.priced",
  title: "Your sample request was priced",
};

describe("prepareNotification", () => {
  it("normalizes text and recipients: trims, drops blanks, removes duplicates, keeps order", () => {
    const prepared = prepareNotification({
      ...base,
      recipientUserIds: [" u2 ", "u1", "", "  ", "u2", "u1"],
      title: "  Priced  ",
      body: "  Oak Panel for 2026-506  ",
      href: "/studioflow/projects/abc/schedule",
      entity: { type: " sample_request_intake ", id: " i1 " },
    });
    assert.deepEqual(prepared.recipientUserIds, ["u2", "u1"]);
    assert.equal(prepared.title, "Priced");
    assert.equal(prepared.body, "Oak Panel for 2026-506");
    assert.equal(prepared.href, "/studioflow/projects/abc/schedule");
    assert.deepEqual([prepared.entityType, prepared.entityId], ["sample_request_intake", "i1"]);
  });

  it("turns empty optional fields into null and allows an empty recipient list", () => {
    const prepared = prepareNotification({ ...base, recipientUserIds: [], body: "   ", href: "", entity: null });
    assert.deepEqual([prepared.recipientUserIds, prepared.body, prepared.href, prepared.entityType, prepared.entityId], [[], null, null, null, null]);
  });

  it("requires a real app id and a kind that is dotted, lowercase, and starts with that app", () => {
    assert.throws(() => prepareNotification({ ...base, appId: "ghost" as never }), /appId/);
    for (const kind of ["priced", "Masterdata.sample.priced", "masterdata.Sample", "studioflow.sample-request.created", "masterdata.", "masterdata..x", "masterdata.a.b.c.d.e"]) {
      assert.throws(() => prepareNotification({ ...base, kind }), /kind/, kind);
    }
    assert.doesNotThrow(() => prepareNotification({ ...base, appId: "studioflow", kind: "studioflow.sample-request.created" }));
  });

  it("limits title, body and recipient count", () => {
    assert.throws(() => prepareNotification({ ...base, title: "   " }), /title/);
    assert.throws(() => prepareNotification({ ...base, title: "t".repeat(NOTIFICATION_TITLE_MAX + 1) }), /title/);
    assert.doesNotThrow(() => prepareNotification({ ...base, title: "t".repeat(NOTIFICATION_TITLE_MAX) }));
    assert.throws(() => prepareNotification({ ...base, body: "b".repeat(NOTIFICATION_BODY_MAX + 1) }), /body/);
    const many = Array.from({ length: NOTIFICATION_RECIPIENTS_MAX + 1 }, (_, index) => `u${index}`);
    assert.throws(() => prepareNotification({ ...base, recipientUserIds: many }), /recipients/);
    assert.doesNotThrow(() => prepareNotification({ ...base, recipientUserIds: many.slice(1) }));
  });

  it("needs both halves of an entity", () => {
    assert.throws(() => prepareNotification({ ...base, entity: { type: "x", id: "  " } }), /entity/);
    assert.throws(() => prepareNotification({ ...base, entity: { type: "", id: "1" } }), /entity/);
  });

  it("refuses any link that could leave the application", () => {
    for (const href of ["https://evil.example/x", "//evil.example/x", "javascript:alert(1)", "mailto:a@b.c", "/a b", "/a\\b", "/a\nb", "/a\u0000b", "relative/path", "/" + "x".repeat(300)]) {
      assert.throws(() => prepareNotification({ ...base, href }), /href/, JSON.stringify(href));
    }
  });
});

describe("isSafeInternalHref", () => {
  it("accepts in-app paths with a query or fragment", () => {
    for (const href of ["/", "/masterdata/sample-requests", "/studioflow/projects/6f35?tab=history#top"]) assert.equal(isSafeInternalHref(href), true, href);
  });
});
