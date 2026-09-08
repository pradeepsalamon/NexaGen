/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { UserRole, UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TrashRepository } from "../trash/trash.repository";
import { PuzzleTopicService } from "./puzzle-topic.service";

const TOKEN = "access-token";
const ADMIN_ID = "admin-1";
const COACH_ID = "coach-1";

const asRole = (id: string, role: UserRole) => ({ id, role, status: UserStatus.ACTIVE });

describe("PuzzleTopicService", () => {
  let service: PuzzleTopicService;
  let jwt: { verifyAsync: jest.Mock };
  let prisma: any;
  let trash: { softDelete: jest.Mock };

  beforeEach(async () => {
    jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: ADMIN_ID, type: "access" }) };
    trash = { softDelete: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(asRole(ADMIN_ID, UserRole.ADMIN)) },
      puzzleTopic: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: "topic-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: null,
          _count: { puzzles: 0 },
          ...data
        }))
      },
      puzzle: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
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
    prisma.puzzleTopic.findUnique.mockResolvedValue({ id: "t1", _count: { puzzles: 4 } });
    await expect(service.archive(TOKEN, "t1")).rejects.toBeInstanceOf(BadRequestException);
    expect(trash.softDelete).not.toHaveBeenCalled();
  });

  it("reassign moves puzzles then soft-deletes the emptied topic", async () => {
    prisma.puzzleTopic.findUnique
      .mockResolvedValueOnce({ id: "t1" })
      .mockResolvedValueOnce({ id: "t2" });
    const res = await service.reassign(TOKEN, "t1", { toTopicId: "t2" });
    expect(prisma.puzzle.updateMany).toHaveBeenCalledWith({
      where: { topicId: "t1", isDeleted: false },
      data: { topicId: "t2" }
    });
    expect(trash.softDelete).toHaveBeenCalledWith(prisma, "PuzzleTopic", "t1", ADMIN_ID);
    expect(res.moved).toBe(2);
  });
});
