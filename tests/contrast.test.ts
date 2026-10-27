import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CELL_GROUND, CELL_INK } from "@/components/GenomeMap";
import { contrastRatio, mixOver, oklchToHex, readableInk } from "@/lib/contrast";

// Expected ratios are the published WCAG / WebAIM figures, not recomputed here.
describe("contrastRatio", () => {
  it("is 21:1 for black on white, in either order", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("puts #767676 just over the 4.5:1 AA line on white and #777777 just under", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("is 1:1 for a colour against itself", () => {
    expect(contrastRatio("#0066c4", "#0066c4")).toBe(1);
  });
});

describe("mixOver", () => {
  it("lays a colour over a background at the given opacity", () => {
    expect(mixOver("#000000", 0.5, "#ffffff")).toBe("#808080");
    expect(mixOver("#0066c4", 1, "#ffffff")).toBe("#0066c4");
    expect(mixOver("#0066c4", 0, "#ffffff")).toBe("#ffffff");
  });
});

describe("readableInk", () => {
  it("writes black on light backgrounds and white on dark ones", () => {
    expect(readableInk("#ffffff")).toBe("#000000");
    expect(readableInk("#e6f3fe")).toBe("#000000");
    expect(readableInk("#02093a")).toBe("#ffffff");
    expect(readableInk("#0066c4")).toBe("#ffffff");
  });

  it("always reaches 4.5:1 on any genome-map cell shade", () => {
    for (let alpha = 0; alpha <= 1; alpha += 0.01) {
      const cell = mixOver(CELL_INK, alpha, CELL_GROUND);
      expect(contrastRatio(readableInk(cell), cell)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("oklchToHex", () => {
  // Expected values from the CSS Color 4 reference conversion (oklch.com).
  it("converts OKLCH to sRGB hex", () => {
    expect(oklchToHex("oklch(100% 0 0)")).toBe("#ffffff");
    expect(oklchToHex("oklch(0% 0 0)")).toBe("#000000");
    expect(oklchToHex("oklch(62.8% 0.2577 29.23)")).toBe("#ff0000");
    expect(oklchToHex("oklch(45.2% 0.3132 264.05)")).toBe("#0000ff");
  });
});

/** Every `--color-*: oklch(…)` in app/tokens.css, by name. */
const TOKENS = Object.fromEntries(
  [...readFileSync("app/tokens.css", "utf8").matchAll(/--color-([\w-]+):\s*(oklch\([^)]*\))/g)].map(
    ([, name, value]) => [name, oklchToHex(value)],
  ),
);

describe("the exam-marking colours", () => {
  // Text colour on the ground it is set on, as the pages use them.
  it.each([
    ["pen", "surface"],
    ["pen", "surface-2"],
    ["pen-quiet", "surface"],
    ["pen-quiet", "surface-2"],
    ["ink", "highlight"],
    ["ink-2", "highlight"],
    ["type-theory-ink", "type-theory"],
    ["type-numerical-ink", "type-numerical"],
    ["accent", "surface"],
    ["accent-soft-ink", "accent-soft"],
  ])("%s on %s reaches 4.5:1", (text, ground) => {
    expect(TOKENS[text], text).toBeDefined();
    expect(TOKENS[ground], ground).toBeDefined();
    expect(contrastRatio(TOKENS[text], TOKENS[ground])).toBeGreaterThanOrEqual(4.5);
  });

  it("writes errors in ink, so red only ever means marks", () => {
    expect(TOKENS.error).toBe(TOKENS.ink);
  });
});
