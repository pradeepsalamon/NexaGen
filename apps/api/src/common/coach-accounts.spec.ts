import * as fs from "fs";
import * as path from "path";
import { UserRole } from "@prisma/client";
import { coachWhere, isCoachAccount } from "./coach-accounts";

describe("coachWhere / isCoachAccount", () => {
  it("matches a primary coach or a staff account that can also teach", () => {
    expect(coachWhere()).toEqual({ OR: [{ role: UserRole.COACH }, { extraRoles: { has: UserRole.COACH } }] });
  });

  it("judges an account's stored roles", () => {
    expect(isCoachAccount({ role: UserRole.COACH })).toBe(true);
    expect(isCoachAccount({ extraRoles: [UserRole.COACH], role: UserRole.ADMIN })).toBe(true);
    expect(isCoachAccount({ extraRoles: [], role: UserRole.SUPER_ADMIN })).toBe(false);
    expect(isCoachAccount({ extraRoles: null, role: UserRole.STUDENT })).toBe(false);
  });
});

/**
 * docs/MULTI_ROLE_ACCOUNTS.md §5.4: a query that looks users up as coaches must
 * use `coachWhere()`, or an admin who can teach goes missing from it (coach
 * pickers, payroll, seat counts, reports). This fails a new raw coach filter.
 * A line that really means "primary role COACH" (a coach application, a new
 * account's data) carries `coach-role-ok: <reason>` on it or the line above.
 */
describe("no raw coach role filters", () => {
  const RAW_COACH_FILTER = /\brole:\s*(UserRole\.COACH|"COACH"|'COACH')|\brole\s*=\s*'COACH'(?!\s+OR\s+'COACH'\s*=\s*ANY)/;
  const root = path.resolve(__dirname, "..");

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.ts$/.test(entry.name) && !/\.(spec|int-spec)\.ts$/.test(entry.name) ? [full] : [];
    });
  }

  it("routes every coach lookup through coachWhere()", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(root)) {
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (!RAW_COACH_FILTER.test(line)) return;
        if (line.includes("coach-role-ok") || lines[index - 1]?.includes("coach-role-ok")) return;
        offenders.push(`${path.relative(root, file)}:${index + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
