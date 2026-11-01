import { LiveClassPullService } from "./live-class-pull.service";

const student = (id: string, username: string | null, firstName = id): {
  id: string;
  firstName: string;
  lastName: null;
  username: string | null;
  avatarUrl: null;
  lastSeenAt: Date | null;
} => ({
  id,
  firstName,
  lastName: null,
  username,
  avatarUrl: null,
  lastSeenAt: null,
});

function build({
  enrolled = [] as ReturnType<typeof student>[],
  pulls = [] as { studentId: string; status: string; student: ReturnType<typeof student> }[],
  exact = null as ReturnType<typeof student> | null,
  matches = [] as ReturnType<typeof student>[],
  inRoom = [] as string[],
  role = "ADMIN" as "ADMIN" | "COACH",
  coachStudents = [] as string[],
  guestRequests = [] as { status: "APPROVED" | "PENDING"; subjectUserId: string }[],
} = {}) {
  const prisma = {
    coachClass: { findUnique: jest.fn().mockResolvedValue({ batchId: "batch-1" }) },
    batchStudent: {
      // Two queries: the class's batch roster (include student) and, for a
      // coach, every student of their own batches (select studentId).
      findMany: jest.fn().mockImplementation(async (args: { select?: unknown }) =>
        args.select ? coachStudents.map((studentId) => ({ studentId })) : enrolled.map((s) => ({ student: s })),
      ),
    },
    approvalRequest: { findMany: jest.fn().mockResolvedValue(guestRequests) },
    liveClassWaitingParticipant: { updateMany: jest.fn() },
    liveClassPull: {
      findMany: jest
        .fn()
        .mockResolvedValue(pulls.map((p) => ({ ...p, requestedAt: new Date("2026-10-12T08:00:00Z") }))),
      upsert: jest.fn(),
    },
    user: {
      findFirst: jest.fn().mockImplementation(async (args: { where: { id?: string } }) =>
        args.where.id ? { id: args.where.id } : exact,
      ),
      findMany: jest.fn().mockResolvedValue(matches),
    },
  };
  const access = {
    resolveClassManager: jest.fn().mockResolvedValue({
      user: { id: "user-1", role },
      liveSession: { id: "ls-1", roomName: "room" },
    }),
    connectedUserIds: jest.fn().mockResolvedValue(new Set(inRoom)),
  };
  const service = new LiveClassPullService(prisma as never, access as never);
  return { prisma, service };
}

describe("LiveClassPullService.getPullRoster", () => {
  it("lists the batch, plus another batch's student only while their pull is pending", async () => {
    const { service, prisma } = build({
      enrolled: [student("a", "anu")],
      pulls: [
        { studentId: "x", status: "PENDING", student: student("x", "xavi") },
        { studentId: "y", status: "JOINED", student: student("y", "yash") },
        { studentId: "z", status: "CANCELLED", student: student("z", "zara") },
      ],
    });

    const { students } = await service.getPullRoster("token", "class-1");

    expect(students.map((s) => s.studentId).sort()).toEqual(["a", "x"]);
    expect(students.find((s) => s.studentId === "a")).toMatchObject({ inBatch: true, username: "anu" });
    expect(students.find((s) => s.studentId === "x")).toMatchObject({ inBatch: false });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("searches every student by username, the class's own batch included", async () => {
    const { service, prisma } = build({
      enrolled: [student("a", "anu_k", "Anitha")],
      matches: [student("a", "anu_k", "Anitha"), student("o", "anu_other", "Other")],
    });

    const { students } = await service.getPullRoster("token", "class-1", "@anu");

    expect(students.map((s) => s.studentId)).toEqual(["a", "o"]);
    expect(students[0].inBatch).toBe(true);
    expect(students[1].inBatch).toBe(false);
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.id).toBeUndefined();
    expect(JSON.stringify(where.AND)).toContain('"username":{"contains":"anu"');
  });

  it("puts the exact username first even when it is outside the first page of matches", async () => {
    const { service } = build({
      exact: student("r", "ravi", "Zed"),
      matches: [student("b", "ravi_b", "Aaron"), student("c", "ravindra", "Bala")],
    });

    const { students } = await service.getPullRoster("token", "class-1", "RAVI");

    expect(students[0]).toMatchObject({ studentId: "r", username: "ravi" });
    expect(students).toHaveLength(3);
  });
});

// V4: a coach pulls only their own batches' students or an approved guest.
describe("LiveClassPullService coach reach (V4)", () => {
  const recent = { ...student("o", "outsider"), lastSeenAt: new Date() };

  it("flags an outside student as needing approval and hides their presence", async () => {
    const { service } = build({
      role: "COACH",
      coachStudents: ["a"],
      matches: [{ ...student("a", "anu"), lastSeenAt: new Date() }, recent],
      guestRequests: [{ status: "PENDING", subjectUserId: "o" }],
    });

    const { students } = await service.getPullRoster("token", "class-1", "an");

    expect(students.find((s) => s.studentId === "a")).toMatchObject({ needsApproval: false, online: true });
    expect(students.find((s) => s.studentId === "o")).toMatchObject({
      needsApproval: true,
      approvalPending: true,
      online: false,
      lastSeenAt: null,
    });
  });

  it("refuses a coach pulling a student outside their batches", async () => {
    const { service, prisma } = build({ role: "COACH", coachStudents: ["a"] });
    await expect(service.pullStudent("token", "class-1", "o")).rejects.toThrow(/Ask an admin/);
    expect(prisma.liveClassPull.upsert).not.toHaveBeenCalled();
  });

  it("lets a coach pull their own batch's student, or an approved guest", async () => {
    const { service, prisma } = build({
      role: "COACH",
      coachStudents: ["a"],
      guestRequests: [{ status: "APPROVED", subjectUserId: "o" }],
    });
    await service.pullStudent("token", "class-1", "a");
    await service.pullStudent("token", "class-1", "o");
    expect(prisma.liveClassPull.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.approvalRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ actionType: "LIVE_CLASS_GUEST_STUDENT", classId: "class-1" }) }),
    );
  });

  it("never limits an admin", async () => {
    const { service, prisma } = build({ role: "ADMIN" });
    await service.pullStudent("token", "class-1", "o");
    expect(prisma.liveClassPull.upsert).toHaveBeenCalled();
    expect(prisma.approvalRequest.findMany).not.toHaveBeenCalled();
  });
});
