/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { LICHESS_FOLDER_SLUG, MAX_PUZZLE_TOPIC_DEPTH } from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TrashRepository } from "../trash/trash.repository";
import { PuzzleTopicService } from "./puzzle-topic.service";

const TOKEN = "access-token";
const ADMIN_ID = "admin-1";
const COACH_ID = "coach-1";

// t1 (Tactics) > t2 (Forks) > t3 (Knight forks); t4 is a separate root.
const TREE = [
  { id: "t1", parentId: null },
  { id: "t2", parentId: "t1" },
  { id: "t3", parentId: "t2" },
  { id: "t4", parentId: null }
];

const asRole = (id: string, role: UserRole) => ({ id, role, status: UserStatus.ACTIVE });

describe("PuzzleTopicService", () => {
  let service: PuzzleTopicService;
  let jwt: { verifyAsync: jest.Mock };
  let prisma: any;
  let trash: { softDelete: jest.Mock; softDeleteGroup: jest.Mock };

  beforeEach(async () => {
    jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: ADMIN_ID, type: "access" }) };
    trash = {
      softDelete: jest.fn().mockResolvedValue(undefined),
      softDeleteGroup: jest.fn().mockResolvedValue(undefined)
    };
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(asRole(ADMIN_ID, UserRole.ADMIN)) },
      puzzleTopic: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
        update: jest.fn().mockImplementation(({ where, data }) => ({
          id: where.id,
          name: "Folder",
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: null,
          _count: { puzzles: 0 },
          ...data
        })),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: "topic-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: null,
          _count: { puzzles: 0 },
          ...data
        }))
      },
      puzzle: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 2 })
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma))
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PuzzleTopicService,
        { provide: JwtService, useValue: jwt },
        { provide: PrismaService, useValue: prisma },
        { provide: TrashRepository, useValue: trash }
      ]
    }).compile();

    service = moduleRef.get(PuzzleTopicService);
  });

  it("blocks a coach from creating a topic", async () => {
    prisma.user.findUnique.mockResolvedValue(asRole(COACH_ID, UserRole.COACH));
    await expect(
      service.create(TOKEN, { name: "Fork" } as never)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a duplicate topic name", async () => {
    prisma.puzzleTopic.findFirst.mockResolvedValue({ id: "other", name: "Fork" });
    await expect(service.create(TOKEN, { name: "Fork" } as never)).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it("refuses to archive a topic that still has puzzles", async () => {
    prisma.puzzleTopic.findUnique.mockResolvedValue({ id: "t1" });
    prisma.puzzle.count.mockResolvedValue(4);
    await expect(service.archive(TOKEN, "t1")).rejects.toBeInstanceOf(BadRequestException);
    expect(trash.softDelete).not.toHaveBeenCalled();
  });

  it("archives a folder together with its subfolders under one group", async () => {
    prisma.puzzleTopic.findUnique.mockResolvedValue({ id: "t1" });
    prisma.puzzleTopic.findMany.mockResolvedValue(TREE);
    await service.archive(TOKEN, "t1");
    expect(prisma.puzzle.count).toHaveBeenCalledWith({
      where: { topicId: { in: expect.arrayContaining(["t1", "t2", "t3"]) }, isDeleted: false }
    });
    expect(trash.softDeleteGroup).toHaveBeenCalledWith(
      prisma,
      "PuzzleTopic",
      expect.arrayContaining(["t1", "t2", "t3"]),
      ADMIN_ID
    );
  });

  it("creates a subfolder under an existing parent", async () => {
    prisma.puzzleTopic.findMany.mockResolvedValue(TREE);
    await service.create(TOKEN, { name: "Knight forks", parentId: "t2" } as never);
    expect(prisma.puzzleTopic.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ parentId: "t2" }) })
    );
    expect(prisma.puzzleTopic.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ parentId: "t2" }) })
    );
  });

  it("refuses to move a folder into its own subfolder", async () => {
    prisma.puzzleTopic.findUnique.mockResolvedValue({ id: "t1", name: "Tactics", parentId: null });
    prisma.puzzleTopic.findMany.mockResolvedValue(TREE);
    await expect(service.update(TOKEN, "t1", { parentId: "t3" })).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(prisma.puzzleTopic.update).not.toHaveBeenCalled();
  });

  it("refuses to nest deeper than the depth cap", async () => {
    const chain = Array.from({ length: MAX_PUZZLE_TOPIC_DEPTH }, (_, i) => ({
      id: `c${i}`,
      parentId: i === 0 ? null : `c${i - 1}`
    }));
    prisma.puzzleTopic.findMany.mockResolvedValue(chain);
    await expect(
      service.create(TOKEN, { name: "Too deep", parentId: `c${MAX_PUZZLE_TOPIC_DEPTH - 1}` } as never)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("keeps the system Lichess folder's slug when it is renamed", async () => {
    prisma.puzzleTopic.findUnique.mockResolvedValue({ id: "t9", name: "Lichess", slug: LICHESS_FOLDER_SLUG, parentId: null });
    await service.update(TOKEN, "t9", { name: "Lichess cache" });
    expect(prisma.puzzleTopic.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Lichess cache", slug: LICHESS_FOLDER_SLUG }) })
    );
  });

  it("moves a folder to the top level", async () => {
    prisma.puzzleTopic.findUnique.mockResolvedValue({ id: "t2", name: "Forks", parentId: "t1" });
    await service.update(TOKEN, "t2", { parentId: null });
    expect(prisma.puzzleTopic.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ parentId: null }) })
    );
  });

  it("reassign moves puzzles then soft-deletes the emptied topic", async () => {
    prisma.puzzleTopic.findUnique
      .mockResolvedValueOnce({ id: "t1" })
      .mockResolvedValueOnce({ id: "t2" });
    const res = await service.reassign(TOKEN, "t1", { toTopicId: "t2" });
    expect(prisma.puzzle.updateMany).toHaveBeenCalledWith({
      where: { topicId: { in: ["t1"] }, isDeleted: false },
      data: { topicId: "t2" }
    });
    expect(trash.softDelete).toHaveBeenCalledWith(prisma, "PuzzleTopic", "t1", ADMIN_ID);
    expect(res.moved).toBe(2);
  });

  describe("copy", () => {
    const FULL = [
      { id: "t1", parentId: null, name: "Tactics", slug: "tactics", description: null, icon: null, sortOrder: 0 },
      { id: "t2", parentId: "t1", name: "Forks", slug: "forks", description: null, icon: null, sortOrder: 0 },
      { id: "t3", parentId: "t2", name: "Knight forks", slug: "knight-forks", description: null, icon: null, sortOrder: 0 },
      { id: "t4", parentId: null, name: "Endgames", slug: "endgames", description: null, icon: null, sortOrder: 0 }
    ];

    beforeEach(() => {
      let next = 0;
      prisma.puzzleTopic.findUnique.mockResolvedValue(FULL[0]);
      prisma.puzzleTopic.findUniqueOrThrow = jest.fn().mockImplementation(({ where }) => ({
        ...FULL[0],
        id: where.id,
        name: "Tactics (copy)",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        _count: { puzzles: 1 }
      }));
      prisma.puzzleTopic.findMany.mockImplementation(({ where }: any = {}) => {
        if (where?.id?.in) return FULL.filter((t) => where.id.in.includes(t.id));
        if (where && "parentId" in where) return FULL.filter((t) => t.parentId === where.parentId);
        return FULL.map(({ id, parentId }) => ({ id, parentId }));
      });
      prisma.puzzleTopic.create.mockImplementation(({ data }: any) => ({ id: `new-${++next}`, ...data }));
      prisma.puzzle.findMany = jest.fn().mockImplementation(({ where }) =>
        where.topicId === "t2"
          ? [{ id: "p1", title: "Fork 1", source: "LICHESS", sourceId: "abc", solutionMovesJson: [], tags: [] }]
          : []
      );
      prisma.puzzle.createMany = jest.fn().mockImplementation(({ data }) => ({ count: data.length }));
    });

    it("copies the whole subtree with a free name and re-sources Lichess puzzles", async () => {
      const res = await service.copy(TOKEN, "t1", { parentId: null });

      expect(prisma.puzzleTopic.create).toHaveBeenCalledTimes(3);
      expect(prisma.puzzleTopic.create.mock.calls[0][0].data).toMatchObject({ name: "Tactics (copy)", parentId: null });
      expect(prisma.puzzleTopic.create.mock.calls[1][0].data).toMatchObject({ name: "Forks", parentId: "new-1" });
      expect(prisma.puzzleTopic.create.mock.calls[2][0].data).toMatchObject({ name: "Knight forks", parentId: "new-2" });
      const copied = prisma.puzzle.createMany.mock.calls[0][0].data[0];
      expect(copied).toMatchObject({ topicId: "new-2", title: "Fork 1", source: "NEXA" });
      expect(copied.sourceId).toBeUndefined();
      expect(res).toMatchObject({ folders: 3, puzzles: 1 });
    });

    it("refuses to copy a folder into its own subfolder", async () => {
      await expect(service.copy(TOKEN, "t1", { parentId: "t3" })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.puzzleTopic.create).not.toHaveBeenCalled();
    });

    it("refuses to copy a system folder", async () => {
      prisma.puzzleTopic.findUnique.mockResolvedValue({ ...FULL[3], slug: LICHESS_FOLDER_SLUG });
      await expect(service.copy(TOKEN, "t4", { parentId: null })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
