import { PayrollCalculationService } from "./payroll-calculation.service";

// Review R7: a coach calculated before stays in scope, so a recalculation zeroes them.
describe("PayrollCalculationService coaches in scope", () => {
  it("includes coaches with classes, a compensation profile, or a record in the period already", async () => {
    const prisma = {
      coachClass: { findMany: jest.fn().mockResolvedValue([{ coachId: "c1" }]) },
      coachCompensationProfile: { findMany: jest.fn().mockResolvedValue([{ coachId: "c1" }, { coachId: "c2" }]) },
      coachPayrollRecord: { findMany: jest.fn().mockResolvedValue([{ coachId: "c3" }]) }
    };
    const service = new PayrollCalculationService(prisma as never, {} as never, {} as never, {} as never);
    const scope = (service as unknown as { getInScopeCoachIds: (id: string, from: Date, to: Date) => Promise<string[]> })
      .getInScopeCoachIds;

    const ids = await scope.call(service, "per_1", new Date("2026-11-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z"));

    expect([...ids].sort()).toEqual(["c1", "c2", "c3"]);
    expect(prisma.coachPayrollRecord.findMany).toHaveBeenCalledWith({ select: { coachId: true }, where: { periodId: "per_1" } });
  });
});
