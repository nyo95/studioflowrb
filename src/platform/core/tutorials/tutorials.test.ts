import assert from "node:assert/strict";
import { it } from "node:test";

import { AppError } from "@platform/core/errors";

import { validateAppTutorial } from "./index";

const step = {
  id: "home",
  anchor: "[data-tour=home]",
  title: { id: "Beranda", en: "Home" },
  body: { id: "Mulai di sini.", en: "Start here." },
};

it("accepts a complete app-owned tour definition", () => {
  const tour = { key: "studioflow", version: 1, steps: [step] };
  assert.equal(validateAppTutorial(tour), tour);
});

it("refuses a tour with too many steps, missing language, or empty text", () => {
  const cases = [
    { key: "studioflow", version: 1, steps: [step, step, step, step, step] },
    { key: "studioflow", version: 1, steps: [{ ...step, title: { id: "Beranda", en: "" } }] },
    { key: "studioflow", version: 1, steps: [{ ...step, body: { id: "", en: "Start here." } }] },
  ];
  for (const tour of cases) {
    assert.throws(() => validateAppTutorial(tour), (error: unknown) => error instanceof AppError && ["TUTORIAL_STEPS", "TUTORIAL_TEXT"].includes(error.code));
  }
});
