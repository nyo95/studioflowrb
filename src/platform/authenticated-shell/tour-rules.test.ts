import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AppTutorial } from "@platform/core/tutorials";

import { shouldAutoShow, stepsFor, tourForPath, TOUR_LABELS } from "./tour-rules";

const text = (id: string, en: string) => ({ id, en });
const tour: AppTutorial = {
  key: "demo", version: 1,
  steps: [
    { id: "a", anchor: "center", title: text("Satu", "One"), body: text("isi", "body") },
    { id: "b", anchor: "#b", requires: "demo.files" as never, title: text("Dua", "Two"), body: text("isi", "body") },
  ],
};

describe("first-use tour rules", () => {
  it("finds the tour of the app the path is in, and none elsewhere", () => {
    const tours = [{ appRootPath: "/studioflow", tour }];
    assert.equal(tourForPath("/studioflow/projects/1", tours)?.tour.key, "demo");
    assert.equal(tourForPath("/studioflow", tours)?.tour.key, "demo");
    assert.equal(tourForPath("/studioflowx", tours), null);
    assert.equal(tourForPath("/settings", tours), null);
  });

  it("shows automatically only until a row exists, whatever its state", () => {
    assert.equal(shouldAutoShow(tour, []), true);
    assert.equal(shouldAutoShow(tour, [{ tourKey: "other" }]), true);
    assert.equal(shouldAutoShow(tour, [{ tourKey: "demo" }]), false);
  });

  it("drops steps the person lacks permission for and picks the language", () => {
    assert.deepEqual(stepsFor(tour, [], "id").map((s) => s.title), ["Satu"]);
    assert.deepEqual(stepsFor(tour, ["demo.files"], "en").map((s) => s.title), ["One", "Two"]);
  });

  it("has labels in both languages", () => {
    assert.equal(TOUR_LABELS.id.progress(1, 4), "Langkah 1 dari 4");
    assert.equal(TOUR_LABELS.en.progress(1, 4), "Step 1 of 4");
  });
});
