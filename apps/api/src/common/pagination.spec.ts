import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginationMeta,
  resolveOrderBy,
  resolvePagination
} from "./pagination";

describe("resolvePagination", () => {
  it("defaults to page 1 and the default page size", () => {
    expect(resolvePagination(undefined)).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
      search: ""
    });
  });

  it("parses string query values and computes skip", () => {
    const r = resolvePagination({ page: "3" as never, pageSize: "10" as never, search: " ana " });
    expect(r).toEqual({ page: 3, pageSize: 10, skip: 20, take: 10, search: "ana" });
  });

  it("clamps page size to the max and rejects sub-1 pages", () => {
    expect(resolvePagination({ pageSize: 5000 as never }).pageSize).toBe(MAX_PAGE_SIZE);
    expect(resolvePagination({ page: 0 as never }).page).toBe(1);
    expect(resolvePagination({ page: -4 as never }).page).toBe(1);
  });
});

describe("paginationMeta", () => {
  it("computes totalPages, never below 1", () => {
    expect(paginationMeta(25, 2, 10)).toEqual({
      total: 25,
      page: 2,
      pageSize: 10,
      totalPages: 3
    });
    expect(paginationMeta(0, 1, 10).totalPages).toBe(1);
  });
});

describe("resolveOrderBy", () => {
  const fallback = [{ createdAt: "desc" as const }];

  it("returns the fallback when sort is missing or not allow-listed", () => {
    expect(resolveOrderBy(undefined, ["name"] as const, fallback)).toBe(fallback);
    expect(resolveOrderBy({ sort: "password" }, ["name"] as const, fallback)).toBe(fallback);
  });

  it("maps an allow-listed sort/order pair", () => {
    expect(resolveOrderBy({ sort: "name", order: "asc" }, ["name"] as const, fallback)).toEqual({
      name: "asc"
    });
    expect(resolveOrderBy({ sort: "name" }, ["name"] as const, fallback)).toEqual({ name: "desc" });
  });
});
