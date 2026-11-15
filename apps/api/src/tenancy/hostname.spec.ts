import { hostnameFromUrl, normalizeHostname } from "./hostname";

describe("normalizeHostname", () => {
  it.each([
    ["NexaChess.IN", "nexachess.in"],
    ["nexachess.in:443", "nexachess.in"],
    ["nexachess.in.", "nexachess.in"],
    ["  www.nexachess.in  ", "www.nexachess.in"],
    ["bücher.example", "xn--bcher-kva.example"],
    ["127.0.0.1:3000", "127.0.0.1"],
    ["[::1]:3000", "[::1]"]
  ])("%s → %s", (input, expected) => {
    expect(normalizeHostname(input)).toBe(expected);
  });

  it.each(["", "   ", "a b.com", "evil.com/path", "user@host", "host:abc", null, undefined])(
    "rejects %p",
    (input) => {
      expect(normalizeHostname(input)).toBeNull();
    }
  );
});

describe("hostnameFromUrl", () => {
  it("reads the host of an origin or referer", () => {
    expect(hostnameFromUrl("https://Dev.NexaChess.in")).toBe("dev.nexachess.in");
    expect(hostnameFromUrl("http://localhost:3000/admin?x=1")).toBe("localhost");
  });

  it("returns null for opaque or broken values", () => {
    expect(hostnameFromUrl("null")).toBeNull();
    expect(hostnameFromUrl("not a url")).toBeNull();
    expect(hostnameFromUrl(undefined)).toBeNull();
  });
});
