import { LiveClassPullService } from "./live-class-pull.service";

const student = (id: string, username: string | null, firstName = id) => ({
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
} = {}) {
  const prisma = {
    coachClass: { findUnique: jest.fn().mockResolvedValue({ batchId: "batch-1" }) },
    batchStudent: { findMany: jest.fn().mockResolvedValue(enrolled.map((s) => ({ student: s }))) },
    liveClassPull: {
      findMany: jest
        .fn()
        .mockResolvedValue(pulls.map((p) => ({ ...p, requestedAt: new Date("2026-10-12T08:00:00Z") }))),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(exact),
      findMany: jest.fn().mockResolvedValue(matches),
    },
  };
  const access = {
    resolveClassManager: jest.fn().mockResolvedValue({ liveSession: { id: "ls-1", roomName: "room" } }),
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
