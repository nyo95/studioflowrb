import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("./quick-messenger.tsx", import.meta.url), "utf8");

describe("QuickMessenger portal regression", () => {
  it("renders the fixed popup panel through document.body instead of inside the topbar subtree", () => {
    assert.match(
      source,
      /import\s+\{\s*createPortal\s*\}\s+from\s+"react-dom";/,
      "QuickMessenger must use React portal support",
    );

    const portalIndex = source.indexOf("createPortal(");
    const fixedPanelIndex = source.search(/<aside[^>]*className="fixed bottom-4 right-4/);
    const documentBodyIndex = source.indexOf("document.body", fixedPanelIndex);

    assert.notEqual(portalIndex, -1, "QuickMessenger popup should be rendered through createPortal");
    assert.ok(fixedPanelIndex > portalIndex, "fixed popup panel should live inside the createPortal call");
    assert.ok(
      documentBodyIndex > fixedPanelIndex,
      "fixed popup panel should be portalled to document.body so backdrop-filter ancestors do not capture it",
    );
    assert.doesNotMatch(
      source,
      /\{open\s+\?\s+\(\s*<aside[^>]*className="fixed bottom-4 right-4/,
      "fixed popup panel must not be rendered as a plain child of the topbar subtree",
    );
  });
});
