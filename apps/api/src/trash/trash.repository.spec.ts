import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { trashEntities } from "../prisma/soft-delete.extension";
import { TrashRepository } from "./trash.repository";

type DelegateMock = {
  count: jest.Mock;
  create: jest.Mock;
  delete: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
};

const delegateNames = [
  ...trashEntities.map((entity) => entity.delegate),
  "trashAuditLog"
];

function buildDelegates(): Record<string, DelegateMock> {
  const delegates: Record<string, DelegateMock> = {};
  for (const name of delegateNames) {
    delegates[name] = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: "x" }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 })
    };
  }
  return delegates;
}

describe("TrashRepository", () => {
  let repository: TrashRepository;
  let delegates: Record<string, DelegateMock>;

  beforeEach(async () => {
    delegates = buildDelegates();

    const prismaService = {
      ...delegates,
      withDeleted: delegates,
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(delegates)
      )
    } as unknown as PrismaService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrashRepository,
        { provide: PrismaService, useValue: prismaService }
      ]
    }).compile();

    repository = module.get(TrashRepository);
  });

  describe("cascadeSoftDelete", () => {
    it("tags a user and both profiles with the same delete group (AUDIT M14)", async () => {
      delegates.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      delegates.coachProfile.updateMany.mockResolvedValue({ count: 1 });

      await repository.cascadeSoftDelete(delegates, "User", "user-1", "admin-1");

      const groupId = delegates.user.update.mock.calls[0][0].data.deleteGroupId;
      expect(groupId).toEqual(expect.any(String));
      expect(delegates.studentProfile.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ deleteGroupId: groupId, isDeleted: true }),
        where: { userId: "user-1", isDeleted: false }
      });
      expect(delegates.coachProfile.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ deleteGroupId: groupId, isDeleted: true }),
        where: { userId: "user-1", isDeleted: false }
      });
    });

    it("cascades a batch delete to its coach and student rows (AUDIT M13)", async () => {
      delegates.batchStudent.updateMany.mockResolvedValue({ count: 3 });

      await repository.cascadeSoftDelete(delegates, "Batch", "batch-1", "admin-1");

      const groupId = delegates.batch.update.mock.calls[0][0].data.deleteGroupId;
      expect(delegates.batchCoach.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ deleteGroupId: groupId }),
        where: { batchId: "batch-1", isDeleted: false }
      });
      expect(delegates.batchStudent.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ deleteGroupId: groupId }),
        where: { batchId: "batch-1", isDeleted: false }
      });
    });

    it("does not log a child entity when nothing was cascaded", async () => {
      await repository.cascadeSoftDelete(delegates, "User", "user-1", "admin-1");

      const loggedEntities = delegates.trashAuditLog.create.mock.calls.map(
        (call) => call[0].data.entity
      );
      expect(loggedEntities).toEqual(["User"]);
    });
  });

  describe("restore", () => {
    it("restores every row sharing the delete group (AUDIT M13)", async () => {
      delegates.user.findFirst.mockResolvedValue({
        id: "user-1",
        deletedAt: new Date(),
        deleteGroupId: "group-1"
      });
      delegates.studentProfile.updateMany.mockResolvedValue({ count: 1 });

      await repository.restore("User", "user-1", "admin-1");

      expect(delegates.user.update).toHaveBeenCalledWith({
        data: {
          deleteGroupId: null,
          deletedAt: null,
          deletedById: null,
          isDeleted: false
        },
        where: { id: "user-1" }
      });
      expect(delegates.studentProfile.updateMany).toHaveBeenCalledWith({
        data: {
          deleteGroupId: null,
          deletedAt: null,
          deletedById: null,
          isDeleted: false
        },
        where: { deleteGroupId: "group-1", isDeleted: true }
      });
    });

    it("skips the group sweep for an item deleted on its own", async () => {
      delegates.user.findFirst.mockResolvedValue({
        id: "user-1",
        deletedAt: new Date(),
        deleteGroupId: null
      });

      await repository.restore("User", "user-1", "admin-1");

      expect(delegates.studentProfile.updateMany).not.toHaveBeenCalled();
      expect(delegates.coachProfile.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("orders each entity query by the requested sort column (AUDIT M8)", async () => {
      await repository.list({
        entity: "Batch",
        page: 1,
        pageSize: 10,
        sortBy: "title",
        sortOrder: "asc"
      });

      expect(delegates.batch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: "asc" } })
      );
    });

    it("orders by the deletedBy relation email when sorting by deletedBy", async () => {
      await repository.list({
        entity: "Batch",
        page: 1,
        pageSize: 10,
        sortBy: "deletedBy",
        sortOrder: "desc"
      });

      expect(delegates.batch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { deletedBy: { email: "desc" } } })
      );
    });
  });
});
