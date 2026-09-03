import { clampPageSize } from "./clamp-page-size.util";

describe("clampPageSize", () => {
  it("returns 1 when the requested size is below 1", () => {
    expect(clampPageSize(0, 50)).toBe(1);
    expect(clampPageSize(-5, 50)).toBe(1);
  });

  it("returns 1 when the requested size is not a finite number", () => {
    expect(clampPageSize(Number.NaN, 50)).toBe(1);
    expect(clampPageSize(Number.POSITIVE_INFINITY, 50)).toBe(1);
  });

  it("returns the max when the requested size exceeds it", () => {
    expect(clampPageSize(5000, 50)).toBe(50);
    expect(clampPageSize(51, 50)).toBe(50);
  });

  it("floors an in-range requested size", () => {
    expect(clampPageSize(20, 50)).toBe(20);
    expect(clampPageSize(19.7, 50)).toBe(19);
    expect(clampPageSize(50, 50)).toBe(50);
    expect(clampPageSize(1, 50)).toBe(1);
  });
});
