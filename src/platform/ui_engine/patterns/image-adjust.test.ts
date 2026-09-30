import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { colorFilter, compressionSteps, formatSize, isNeutral, NEUTRAL_ADJUST } from "./image-adjust";

describe("image colour adjustment", () => {
  it("leaves an untouched image alone", () => {
    assert.equal(isNeutral(NEUTRAL_ADJUST), true);
    assert.equal(colorFilter(NEUTRAL_ADJUST), "none");
  });

  it("builds one filter string once anything moves", () => {
    assert.equal(colorFilter({ hue: 5, saturation: 110, brightness: 95 }), "hue-rotate(5deg) saturate(110%) brightness(95%)");
  });
});

describe("image compression plan", () => {
  it("starts with the caller's own settings so an image that already fits is encoded once, as before", () => {
    assert.deepEqual(compressionSteps("image/jpeg", 0.86)[0], { scale: 1, quality: 0.86 });
    assert.deepEqual(compressionSteps("image/png", 0.86)[0], { scale: 1, quality: 0.86 });
  });

  it("lowers JPEG quality before shrinking pixels, and never raises quality", () => {
    const steps = compressionSteps("image/jpeg", 0.86);
    const firstShrink = steps.findIndex((step) => step.scale < 1);
    assert.ok(steps.slice(0, firstShrink).every((step) => step.scale === 1));
    assert.ok(steps.every((step) => step.quality <= 0.86));
    assert.deepEqual(compressionSteps("image/jpeg", 0.6).filter((step) => step.scale === 1), [{ scale: 1, quality: 0.6 }]);
  });

  it("only shrinks pixels for PNG", () => {
    assert.ok(compressionSteps("image/png", 0.86).slice(1).every((step) => step.scale < 1));
  });

  it("formats sizes for people", () => {
    assert.equal(formatSize(500), "1 KB");
    assert.equal(formatSize(300 * 1024), "300 KB");
    assert.equal(formatSize(6 * 1024 * 1024), "6.0 MB");
  });
});
