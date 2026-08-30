import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import { AssignmentService } from "./assignment.service";
import { AssignmentEvaluationService } from "./assignment-evaluation.service";
import { PrismaService } from "../prisma/prisma.service";
import { UploadService } from "../upload/upload.service";

const TOKEN = "access-token";
const COACH_ID = "coach-1";
const ADMIN_ID = "admin-1";
const STUDENT_ID = "student-1";

const VALID_PGN = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6";

describe("AssignmentService", () => {
  let service: AssignmentService;
  let jwt: { verifyAsync: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock };
    assignment: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    assignmentBatch: { upsert: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; delete: jest.Mock };
    batch: { findMany: jest.Mock };
    batchStudent: { findMany: jest.Mock };
    studentAssignment: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      createMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let upload: { uploadPgn: jest.Mock };

  const asRole = (id: string, role: UserRole) => ({ id, role, status: UserStatus.ACTIVE });

  beforeEach(async () => {
    jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: COACH_ID, type: "access" }) };

    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(asRole(COACH_ID, UserRole.COACH)) },
      assignment: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => ({ id: "asg-1", ...data })),
        update: jest.fn().mockImplementation(({ data }) => ({ id: "asg-1", ...data })),
        delete: jest.fn().mockResolvedValue({ id: "asg-1" })
      },
      assignmentBatch: {
        upsert: jest.fn().mockResolvedValue({ id: "dep-1" }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({ id: "dep-1" })
      },
      batch: {
        findMany: jest.fn().mockResolvedValue([
          { id: "batch-1", isDeleted: false, coaches: [{ coachId: COACH_ID }] }
        ])
      },
      batchStudent: {
        findMany: jest.fn().mockResolvedValue([{ studentId: "s1" }, { studentId: "s2" }])
      },
      studentAssignment: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 2 })
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma))
    };

    // getLibraryItem re-read after create/update
    prisma.assignment.findUnique.mockResolvedValue({
      id: "asg-1",
      title: "T",
      description: null,
      pgn: VALID_PGN,
      pgnUrl: "http://cloud/t.pgn",
      difficulty: "BEGINNER",
      isLibrary: false,
      createdById: COACH_ID,
      createdBy: { firstName: "Coach", lastName: "One" },
      _count: { deployments: 0 },
      createdAt: new Date()
    });

    upload = { uploadPgn: jest.fn().mockResolvedValue({ secure_url: "http://cloud/t.pgn" }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: UploadService, useValue: upload },
        {
          provide: AssignmentEvaluationService,
          useValue: {
            normalizeSolution: jest.fn((_fen: string, moves: unknown[]) => moves),
            buildLinePgn: jest.fn(() => "1. e4 e5"),
            positionPgn: jest.fn(() => "*")
          }
        }
      ]
    }).compile();

    service = module.get(AssignmentService);
  });

  describe("create", () => {
    it("rejects an invalid PGN before touching the database", async () => {
      await expect(
        service.create(TOKEN, { title: "T", pgn: "not a game", difficulty: "BEGINNER" })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.assignment.create).not.toHaveBeenCalled();
    });

    it("rejects a batch the coach is not assigned to", async () => {
      prisma.batch.findMany.mockResolvedValueOnce([
        { id: "batch-1", isDeleted: false, coaches: [{ coachId: "other-coach" }] }
      ]);

      await expect(
        service.create(TOKEN, {
          title: "T",
          pgn: VALID_PGN,
          difficulty: "BEGINNER",
          batchIds: ["batch-1"],
          dueDate: new Date(Date.now() + 86_400_000).toISOString()
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.assignment.create).not.toHaveBeenCalled();
    });

    it("fans out one student row per batch member when a coach assigns on create", async () => {
      await service.create(TOKEN, {
        title: "T",
        pgn: VALID_PGN,
        difficulty: "BEGINNER",
        batchIds: ["batch-1"],
        dueDate: new Date(Date.now() + 86_400_000).toISOString()
      });

      expect(prisma.assignmentBatch.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.studentAssignment.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            { assignmentBatchId: "dep-1", studentId: "s1" },
            { assignmentBatchId: "dep-1", studentId: "s2" }
          ],
          skipDuplicates: true
        })
      );
    });

    it("marks an admin-authored item as a shared library item", async () => {
      prisma.user.findUnique.mockResolvedValue(asRole(ADMIN_ID, UserRole.ADMIN));

      await service.create(TOKEN, { title: "T", pgn: VALID_PGN, difficulty: "BEGINNER" });

      expect(prisma.assignment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isLibrary: true }) })
      );
    });

    it("stops an admin from assigning directly to batches", async () => {
      prisma.user.findUnique.mockResolvedValue(asRole(ADMIN_ID, UserRole.ADMIN));

      await expect(
        service.create(TOKEN, {
          title: "T",
          pgn: VALID_PGN,
          difficulty: "BEGINNER",
          batchIds: ["batch-1"],
          dueDate: new Date(Date.now() + 86_400_000).toISOString()
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("student access", () => {
    it("404s when the student has no row for the assignment", async () => {
      prisma.user.findUnique.mockResolvedValue(asRole(STUDENT_ID, UserRole.STUDENT));
      prisma.studentAssignment.findUnique.mockResolvedValue(null);

      await expect(service.getForStudent(TOKEN, "sa-1")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("404s when the row belongs to another student", async () => {
      prisma.user.findUnique.mockResolvedValue(asRole(STUDENT_ID, UserRole.STUDENT));
      prisma.studentAssignment.findUnique.mockResolvedValue({ id: "sa-1", studentId: "someone-else" });

      await expect(service.getForStudent(TOKEN, "sa-1")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("updateStatus", () => {
    const studentRow = {
      id: "sa-1",
      status: "COMPLETED",
      completedAt: new Date(),
      note: null,
      studentId: STUDENT_ID,
      assignmentBatch: {
        dueDate: new Date(),
        batch: { name: "Batch A" },
        assignment: {
          id: "asg-1",
          title: "T",
          description: null,
          pgn: VALID_PGN,
          pgnUrl: null,
          difficulty: "BEGINNER",
          createdBy: { firstName: "Coach", lastName: "One" }
        }
      }
    };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(asRole(STUDENT_ID, UserRole.STUDENT));
      prisma.studentAssignment.findUnique.mockResolvedValue({
        id: "sa-1",
        studentId: STUDENT_ID,
        assignmentBatch: { assignment: { activityType: "REPLAY" } }
      });
    });

    it("stamps completedAt when marking COMPLETED", async () => {
      prisma.studentAssignment.update.mockResolvedValue(studentRow);

      await service.updateStatus(TOKEN, "sa-1", { status: "COMPLETED" });

      expect(prisma.studentAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "COMPLETED", completedAt: expect.any(Date) })
        })
      );
    });

    it("clears completedAt when moving back to IN_PROGRESS", async () => {
      prisma.studentAssignment.update.mockResolvedValue({ ...studentRow, status: "IN_PROGRESS", completedAt: null });

      await service.updateStatus(TOKEN, "sa-1", { status: "IN_PROGRESS" });

      expect(prisma.studentAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "IN_PROGRESS", completedAt: null }) })
      );
    });
  });
});
