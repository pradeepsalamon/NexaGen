import { BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import { UserRole, UserStatus } from "@prisma/client";
import { JobLockService } from "../prisma/job-lock.service";
import { createJobLockStub } from "../prisma/job-lock.testing";
import { PrismaService } from "../prisma/prisma.service";
import { UploadService } from "../upload/upload.service";
import { TrashRepository } from "./trash.repository";
import { TrashService } from "./trash.service";

describe("TrashService — financial history retention", () => {
  let service: TrashService;
  let repository: {
    findDeleted: jest.Mock;
    findExpired: jest.Mock;
    findUserIdsWithRetainedHistory: jest.Mock;
    hardDelete: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      findDeleted: jest.fn().mockResolvedValue({}),
      findExpired: jest.fn(),
      findUserIdsWithRetainedHistory: jest.fn().mockResolvedValue(new Set()),
      hardDelete: jest.fn().mockResolvedValue(true)
    };
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "admin",
          role: UserRole.SUPER_ADMIN,
          status: UserStatus.ACTIVE
        })
      },
      withDeleted: { user: { findUnique: jest.fn().mockResolvedValue(null) } }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrashService,
        { provide: TrashRepository, useValue: repository },
        { provide: JobLockService, useValue: createJobLockStub() },
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteImage: jest.fn() } },
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn().mockResolvedValue({ sub: "admin", type: "access" }) }
        }
      ]
    }).compile();

    service = module.get(TrashService);
  });

  it("keeps a user with financial history and the rest of their delete group out of the purge", async () => {
    repository.findExpired.mockResolvedValue([
      { deleteGroupId: "g-paid", entity: "StudentProfile", id: "sp-paid" },
      { deleteGroupId: "g-paid", entity: "User", id: "paid" },
      { deleteGroupId: "g-free", entity: "StudentProfile", id: "sp-free" },
      { deleteGroupId: "g-free", entity: "User", id: "free" }
    ]);
    repository.findUserIdsWithRetainedHistory.mockResolvedValue(new Set(["paid"]));

    const deleted = await service.cleanupExpiredTrash();

    expect(deleted).toBe(2);
    const purged = repository.hardDelete.mock.calls.map((call) => call[2]);
    expect(purged).toEqual(["sp-free", "free"]);
  });

  it("refuses to permanently delete a user with financial history", async () => {
    repository.findUserIdsWithRetainedHistory.mockResolvedValue(new Set(["paid"]));

    await expect(service.permanentDelete("token", "User", "paid")).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(repository.hardDelete).not.toHaveBeenCalled();
  });
});
