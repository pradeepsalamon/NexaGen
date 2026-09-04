import { isBlank } from "./text";

describe("isBlank", () => {
  it("treats null and undefined as blank", () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
  });

  it("treats empty and whitespace-only strings as blank", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("   ")).toBe(true);
    expect(isBlank("\t\n ")).toBe(true);
  });

  it("treats strings with any non-whitespace content as not blank", () => {
    expect(isBlank("a")).toBe(false);
    expect(isBlank("  x  ")).toBe(false);
  });

  it("treats falsy non-string values as not blank", () => {
    expect(isBlank(0)).toBe(false);
    expect(isBlank(false)).toBe(false);
    expect(isBlank(NaN)).toBe(false);
  });

  it("treats objects and arrays as not blank", () => {
    expect(isBlank({})).toBe(false);
    expect(isBlank([])).toBe(false);
  });
});
