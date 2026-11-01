import { UserRole } from "@prisma/client";
import type { EntitlementService } from "../platform/entitlement.service";
import type { PrismaService } from "../prisma/prisma.service";
import { RequestQueuesService } from "./request-queues.service";

/** Stage 5: the other review queues, listed read-only in the admin inbox. */
describe("RequestQueuesService", () => {
  const created = new Date("2026-10-30T08:00:00.000Z");
  let prisma: {
    accountDeletionRequest: { count: jest.Mock; findMany: jest.Mock };
    manualPaymentRecord: { count: jest.Mock; findMany: jest.Mock };
    user: { count: jest.Mock; findMany: jest.Mock };
  };
  let hasFeature: jest.Mock;
  const service = () =>
    new RequestQueuesService(
      { hasFeature } as unknown as EntitlementService,
      prisma as unknown as PrismaService
    );
  const admin = { id: "a", role: UserRole.ADMIN, timezone: "UTC" };
  const superAdmin = { id: "s", role: UserRole.SUPER_ADMIN, timezone: "UTC" };

  beforeEach(() => {
    hasFeature = jest.fn().mockResolvedValue(true);
    prisma = {
      accountDeletionRequest: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ createdAt: created, id: "del-1", userName: "Asha K", userRole: "STUDENT" }])
      },
      manualPaymentRecord: {
        count: jest.fn().mockResolvedValue(7),
        findMany: jest.fn().mockResolvedValue([
          {
            createdAt: created,
            id: "mp-1",
            payment: {
              amount: 250000,
              currency: "INR",
              order: { plan: { batch: { name: "Juniors" }, name: "Monthly" }, user: { firstName: "Ravi", lastName: null } }
            },
            recordedByUser: { firstName: "Coach", lastName: "One" }
          }
        ])
      },
      user: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([
          { coachProfile: { fideRating: 2100, title: "FM" }, createdAt: created, firstName: "Meera", id: "c-1", lastName: "S" }
        ])
      }
    };
  });

  it("shows an admin the payment and deletion queues, oldest first, with full counts", async () => {
    const { queues } = await service().list(admin);
    expect(queues.map((q) => q.kind)).toEqual(["MANUAL_PAYMENT", "ACCOUNT_DELETION"]);
    expect(queues[0]).toMatchObject({
      items: [{ createdAt: created.toISOString(), id: "mp-1", subtitle: "Juniors · Monthly · recorded by Coach One" }],
      pendingCount: 7
    });
    expect(queues[0].items[0].title).toMatch(/^Ravi · ₹2,500/);
    expect(queues[1].items[0]).toMatchObject({ subtitle: "Student", title: "Asha K" });
    expect(prisma.manualPaymentRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" }, take: 5, where: { status: "PENDING" } })
    );
    // Coach applications are super-admin only: never even queried for an admin.
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("adds coach applications for a super admin", async () => {
    const { queues } = await service().list(superAdmin);
    expect(queues.map((q) => q.kind)).toEqual(["MANUAL_PAYMENT", "ACCOUNT_DELETION", "COACH_APPLICATION"]);
    expect(queues[2]).toMatchObject({ items: [{ subtitle: "FM · FIDE 2100", title: "Meera S" }], pendingCount: 2 });
  });

  it("leaves out offline payments when the plan doesn't include student payments", async () => {
    hasFeature.mockResolvedValue(false);
    const { queues } = await service().list(superAdmin);
    expect(queues.map((q) => q.kind)).toEqual(["ACCOUNT_DELETION", "COACH_APPLICATION"]);
    expect(hasFeature).toHaveBeenCalledWith("studentPayments");
    expect(prisma.manualPaymentRecord.count).not.toHaveBeenCalled();
  });
});
