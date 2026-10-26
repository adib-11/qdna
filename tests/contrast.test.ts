import { describe, expect, it } from "vitest";
import { contrastRatio, mixOver, readableInk } from "@/lib/contrast";

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
      const cell = mixOver("#0066c4", alpha, "#ffffff");
      expect(contrastRatio(readableInk(cell), cell)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
