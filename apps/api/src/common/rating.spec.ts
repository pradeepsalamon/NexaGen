import { clampInt } from "./rating";

describe("clampInt", () => {
  it("returns an in-range value unchanged", () => {
    expect(clampInt(1500, 0, 3000)).toBe(1500);
  });

  it("floors fractional values towards negative infinity", () => {
    expect(clampInt(1500.9, 0, 3000)).toBe(1500);
    expect(clampInt(-0.5, -10, 10)).toBe(-1);
  });

  it("clamps below the minimum", () => {
    expect(clampInt(-5, 0, 3000)).toBe(0);
  });

  it("clamps above the maximum", () => {
    expect(clampInt(9999, 0, 3000)).toBe(3000);
  });

  it("returns min for non-finite input", () => {
    expect(clampInt(NaN, 100, 3000)).toBe(100);
    expect(clampInt(Infinity, 100, 3000)).toBe(100);
    expect(clampInt(-Infinity, 100, 3000)).toBe(100);
  });

  it("honours the boundaries as inclusive", () => {
    expect(clampInt(0, 0, 3000)).toBe(0);
    expect(clampInt(3000, 0, 3000)).toBe(3000);
  });
});
