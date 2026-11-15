import { BadRequestException } from "@nestjs/common";
import {
  createdAtCursorWhere,
  decodeCreatedAtCursor,
  encodeCreatedAtCursor,
  toCursorPage
} from "./cursor-pagination";

const row = (id: string, iso: string) => ({ createdAt: new Date(iso), id });

describe("cursor-pagination", () => {
  it("round-trips a cursor", () => {
    const original = row("abc", "2026-11-09T10:00:00.123Z");
    expect(decodeCreatedAtCursor(encodeCreatedAtCursor(original))).toEqual(original);
  });

  it.each(["not-base64-json", Buffer.from("[1,2]").toString("base64url"), Buffer.from('["nope","x"]').toString("base64url"), Buffer.from('["2026-01-01T00:00:00Z",""]').toString("base64url")])(
    "rejects a malformed cursor %s with a 400",
    (cursor) => {
      expect(() => decodeCreatedAtCursor(cursor)).toThrow(BadRequestException);
    }
  );

  it("builds no filter for the first page", () => {
    expect(createdAtCursorWhere(undefined)).toEqual({});
  });

  it("selects rows strictly after the cursor, breaking timestamp ties by id", () => {
    const at = new Date("2026-11-09T10:00:00.000Z");
    expect(createdAtCursorWhere(encodeCreatedAtCursor({ createdAt: at, id: "m" }))).toEqual({
      OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: "m" } }]
    });
  });

  it("returns a nextCursor only when the probe row exists", () => {
    const rows = [row("c", "2026-11-09T03:00:00Z"), row("b", "2026-11-09T02:00:00Z"), row("a", "2026-11-09T01:00:00Z")];

    const full = toCursorPage(rows, 2);
    expect(full.items.map((r) => r.id)).toEqual(["c", "b"]);
    expect(decodeCreatedAtCursor(full.nextCursor as string)).toEqual(rows[1]);

    const last = toCursorPage(rows, 3);
    expect(last.items).toHaveLength(3);
    expect(last.nextCursor).toBeNull();
  });
});
