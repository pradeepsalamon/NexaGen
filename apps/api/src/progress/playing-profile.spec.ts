import { ForbiddenException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { ProgressService } from "./progress.service";

// Review F1: tournaments read rating, date of birth and level, so only staff set them.
describe("ProgressService playing profile", () => {
  const STUDENT_ID = "student-1";
  let actor: { id: string; role: UserRole };
  let prisma: {
    $transaction: jest.Mock;
    batchStudent: { findFirst: jest.Mock };
    studentProfile: { findFirst: jest.Mock; update: jest.Mock };
    trashAuditLog: { create: jest.Mock };
    user: { findFirst: jest.Mock; findUnique: jest.Mock };
  };
  let service: ProgressService;

  const stored = { chessRating: 1600, dateOfBirth: new Date("2014-05-02T00:00:00.000Z"), experienceLevel: "INTERMEDIATE", id: "sp-1" };

  beforeEach(() => {
    actor = { id: "admin-1", role: UserRole.ADMIN };
    prisma = {
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
      batchStudent: { findFirst: jest.fn().mockResolvedValue({ id: "bs-1" }) },
      studentProfile: {
        findFirst: jest.fn().mockResolvedValue(stored),
        update: jest.fn(async ({ data }) => ({ ...stored, ...data }))
      },
      trashAuditLog: { create: jest.fn() },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: STUDENT_ID }),
        findUnique: jest.fn(async () => ({ ...actor, extraRoles: [], status: UserStatus.ACTIVE }))
      }
    };
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: "x", type: "access" }) };
    service = new ProgressService(jwt as unknown as JwtService, prisma as unknown as PrismaService);
  });

  it("reads the three fields for staff, the date as a date only", async () => {
    await expect(service.getPlayingProfile("t", STUDENT_ID)).resolves.toEqual({
      chessRating: 1600,
      dateOfBirth: "2014-05-02",
      experienceLevel: "INTERMEDIATE"
    });
  });

  it("refuses the student themselves", async () => {
    actor = { id: STUDENT_ID, role: UserRole.STUDENT };
    await expect(
      service.updatePlayingProfile("t", STUDENT_ID, { chessRating: 900, dateOfBirth: null, experienceLevel: "BEGINNER" })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.studentProfile.update).not.toHaveBeenCalled();
  });

  it("refuses a coach who doesn't coach the student", async () => {
    actor = { id: "coach-2", role: UserRole.COACH };
    prisma.batchStudent.findFirst.mockResolvedValue(null);
    await expect(service.getPlayingProfile("t", STUDENT_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lets the student's coach change them and records who changed which field", async () => {
    actor = { id: "coach-1", role: UserRole.COACH };
    const res = await service.updatePlayingProfile("t", STUDENT_ID, {
      chessRating: 1650,
      dateOfBirth: "2014-05-02",
      experienceLevel: "INTERMEDIATE"
    });

    expect(res.chessRating).toBe(1650);
    expect(prisma.studentProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sp-1" } })
    );
    expect(prisma.trashAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: "STUDENT_PLAYING_PROFILE_CHANGE",
        entity: "StudentProfile",
        entityId: STUDENT_ID,
        metadata: { changed: ["chessRating"] },
        userId: "coach-1"
      }
    });
  });

  it("refuses a date of birth in the future", async () => {
    await expect(
      service.updatePlayingProfile("t", STUDENT_ID, { chessRating: null, dateOfBirth: "2999-01-01", experienceLevel: "BEGINNER" })
    ).rejects.toThrow("Enter a date of birth in the past.");
  });
});
