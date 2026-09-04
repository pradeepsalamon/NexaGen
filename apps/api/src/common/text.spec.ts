import { isBlank, stripAccents, titleCase } from "./text";

describe("titleCase", () => {
  it("returns an empty string for empty input", () => {
    expect(titleCase("")).toBe("");
  });

  it("uppercases the first letter of each word and lowercases the rest", () => {
    expect(titleCase("hello world")).toBe("Hello World");
    expect(titleCase("HELLO WORLD")).toBe("Hello World");
    expect(titleCase("mIxEd CaSe")).toBe("Mixed Case");
  });

  it("preserves runs of whitespace, tabs, and newlines", () => {
    expect(titleCase("  foo   bar ")).toBe("  Foo   Bar ");
    expect(titleCase("foo\tbar\nbaz")).toBe("Foo\tBar\nBaz");
  });

  it("handles single words and leaves whitespace-only input untouched", () => {
    expect(titleCase("nexa")).toBe("Nexa");
    expect(titleCase("   ")).toBe("   ");
  });
});

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

describe("stripAccents", () => {
  it("returns an empty string for empty input", () => {
    expect(stripAccents("")).toBe("");
  });

  it("removes diacritics while keeping the base letters", () => {
    expect(stripAccents("Crème Brûlée")).toBe("Creme Brulee");
    expect(stripAccents("naïve façade")).toBe("naive facade");
    expect(stripAccents("Zürich, Málaga, São Paulo")).toBe(
      "Zurich, Malaga, Sao Paulo",
    );
  });

  it("preserves casing, spacing, and non-accented text", () => {
    expect(stripAccents("Hello World")).toBe("Hello World");
    expect(stripAccents("  spaced\tout\n")).toBe("  spaced\tout\n");
  });

  it("works on pre-composed and already-decomposed input alike", () => {
    expect(stripAccents("é")).toBe("e");
    expect(stripAccents("é")).toBe("e");
  });

  it("leaves characters without combining marks untouched", () => {
    expect(stripAccents("日本語 123 ß")).toBe("日本語 123 ß");
  });
});
