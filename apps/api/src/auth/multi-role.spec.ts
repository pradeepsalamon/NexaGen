import { accountRoles, canHoldExtraRole, resolveActiveRole, rolesOf } from "@nexa-chess/types";

// The shared rules of docs/MULTI_ROLE_ACCOUNTS.md §3 (v1: staff + COACH only).
describe("multi-role rules", () => {
  it("lets only a staff account also teach", () => {
    expect(canHoldExtraRole("ADMIN", "COACH")).toBe(true);
    expect(canHoldExtraRole("SUPER_ADMIN", "COACH")).toBe(true);
    expect(canHoldExtraRole("COACH", "COACH")).toBe(false);
    expect(canHoldExtraRole("STUDENT", "COACH")).toBe(false);
    expect(canHoldExtraRole("SALES", "COACH")).toBe(false);
    expect(canHoldExtraRole("ADMIN", "STUDENT")).toBe(false);
    expect(canHoldExtraRole("ADMIN", "SUPER_ADMIN")).toBe(false);
    expect(canHoldExtraRole("COACH", "ADMIN")).toBe(false);
  });

  it("lists the primary role first and drops roles the account may not hold", () => {
    expect(accountRoles("ADMIN", ["COACH"])).toEqual(["ADMIN", "COACH"]);
    expect(accountRoles("ADMIN", ["COACH", "COACH", "STUDENT"])).toEqual(["ADMIN", "COACH"]);
    expect(accountRoles("STUDENT", ["COACH"])).toEqual(["STUDENT"]);
    expect(accountRoles("COACH", null)).toEqual(["COACH"]);
  });

  it("resolves the active role, falling back to the primary one", () => {
    expect(resolveActiveRole("ADMIN", ["COACH"], "COACH")).toBe("COACH");
    expect(resolveActiveRole("ADMIN", ["COACH"], null)).toBe("ADMIN");
    expect(resolveActiveRole("ADMIN", [], "COACH")).toBe("ADMIN");
    expect(resolveActiveRole("ADMIN", ["COACH"], "SUPER_ADMIN")).toBe("ADMIN");
  });

  it("reads an AuthUser's roles, old payloads included", () => {
    expect(rolesOf({ role: "COACH" })).toEqual(["COACH"]);
    expect(rolesOf({ role: "COACH", roles: ["ADMIN", "COACH"] })).toEqual(["ADMIN", "COACH"]);
  });
});
