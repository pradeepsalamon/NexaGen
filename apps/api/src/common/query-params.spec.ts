import { BadRequestException } from "@nestjs/common";
import { UserStatus } from "@prisma/client";
import { optionalQueryEnum, optionalQueryString } from "./query-params";

describe("optionalQueryString", () => {
  it("passes a single value through and treats empty as absent", () => {
    expect(optionalQueryString("abc", "id")).toBe("abc");
    expect(optionalQueryString("", "id")).toBeUndefined();
    expect(optionalQueryString(undefined, "id")).toBeUndefined();
  });

  it("rejects a repeated key or a nested object with a 400", () => {
    expect(() => optionalQueryString(["a", "b"], "id")).toThrow(BadRequestException);
    expect(() => optionalQueryString({ a: "b" }, "id")).toThrow(BadRequestException);
  });
});

describe("optionalQueryEnum", () => {
  it("accepts a member of a Prisma enum or a value list", () => {
    expect(optionalQueryEnum("ACTIVE", UserStatus, "status")).toBe(UserStatus.ACTIVE);
    expect(optionalQueryEnum("b", ["a", "b"] as const, "kind")).toBe("b");
    expect(optionalQueryEnum(undefined, UserStatus, "status")).toBeUndefined();
  });

  it("rejects an unknown value with a 400", () => {
    expect(() => optionalQueryEnum("NOPE", UserStatus, "status")).toThrow(BadRequestException);
    expect(() => optionalQueryEnum(["ACTIVE"], UserStatus, "status")).toThrow(BadRequestException);
  });
});
