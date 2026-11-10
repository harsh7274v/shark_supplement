import { describe, expect, it } from "vitest";
import { discountPercent, toPaise } from "../src/lib/money";

describe("discountPercent", () => {
  it("rounds the percent discount to the nearest integer", () => {
    expect(discountPercent(399900, 299900)).toBe(25);
    expect(discountPercent(349900, 219900)).toBe(37);
  });

  it("returns 0 when mrp is 0", () => {
    expect(discountPercent(0, 0)).toBe(0);
  });

  it("clamps to 0 when sale exceeds mrp", () => {
    // Validation lives elsewhere (Task 10); the helper itself must never go negative.
    expect(discountPercent(1000, 1500)).toBe(0);
  });
});

describe("toPaise", () => {
  it("converts rupees to paise integers", () => {
    expect(toPaise(3999)).toBe(399900);
    expect(toPaise(19.99)).toBe(1999);
  });
});
