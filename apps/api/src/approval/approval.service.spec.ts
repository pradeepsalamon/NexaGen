import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { APPROVAL_ACTIONS } from "@nexa-chess/types";
import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { z } from "zod";
import { createJobLockStub } from "../prisma/job-lock.testing";
import type { JobLockService } from "../prisma/job-lock.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ApprovalHandler } from "./approval-handler";
import { ApprovalService } from "./approval.service";

/**
 * The engine's guarantees (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md
 * §2.3), against an in-memory Prisma whose $transaction really rolls back.
 */

type Row = Record<string, unknown> & { id: string; status: string; dedupeKey: string; expiresAt: Date };

function makeStore() {
  let requests: Row[] = [];
  let events: Record<string, unknown>[] = [];
  let seq = 0;
  const users: Record<string, { id: string; role: UserRole }> = {};

  const matches = (row: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, cond]) => {
      if (key === "NOT") return !matches(row, cond as Record<string, unknown>);
      const value = row[key];
      if (cond && typeof cond === "object" && !(cond instanceof Date)) {
        const c = cond as { gt?: Date; lte?: Date };
        if (c.gt) return (value as Date) > c.gt;
        if (c.lte) return (value as Date) <= c.lte;
      }
      return value === cond;
    });

  const withRelations = (row: Row) => ({
    ...row,
    batch: null,
    class: null,
    requester: row.requesterId ? { firstName: String(row.requesterId), lastName: null } : null,
    reviewer: row.reviewerId ? { firstName: String(row.reviewerId), lastName: null } : null,
    subjectUser: null
  });

  const prisma: Record<string, unknown> = {
    user: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const u = users[where.id];
      return u ? { ...u, status: UserStatus.ACTIVE, timezone: "UTC" } : null;
    }) },
    approvalRequest: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (requests.some((r) => r.status === "PENDING" && r.dedupeKey === data.dedupeKey)) {
          throw new Prisma.PrismaClientKnownRequestError("dup", { clientVersion: "x", code: "P2002" });
        }
        const row = { createdAt: new Date(), id: `req-${++seq}`, reviewerId: null, status: "PENDING", ...data } as unknown as Row;
        requests.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = requests.find((r) => r.id === where.id);
        return row ? { ...row } : null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = requests.find((r) => r.id === where.id);
        if (!row) throw new Error("not found");
        return withRelations(row);
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        requests.filter((r) => matches(r, where)).map(withRelations)
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = requests.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = requests.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      })
    },
    approvalEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push({ createdAt: new Date(), id: `ev-${++seq}`, ...data });
        return data;
      }),
      findMany: jest.fn(async ({ where }: { where: { requestId: string } }) =>
        events.filter((e) => e.requestId === where.requestId).map((e) => ({ ...e, actor: null }))
      )
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => {
      const snapshot = { events: structuredClone(events), requests: structuredClone(requests) };
      try {
        return await fn(prisma);
      } catch (error) {
        requests = snapshot.requests;
        events = snapshot.events;
        throw error;
      }
    })
  };
  return {
    prisma,
    users,
    events: () => events,
    requests: () => requests
  };
}

describe("ApprovalService", () => {
  const coach = { id: "coach-1", role: UserRole.COACH };
  const otherCoach = { id: "coach-2", role: UserRole.COACH };
  const admin = { id: "admin-1", role: UserRole.ADMIN };
  const student = { id: "student-1", role: UserRole.STUDENT };

  let store: ReturnType<typeof makeStore>;
  let jwt: { verifyAsync: jest.Mock };
  let handler: jest.Mocked<ApprovalHandler<{ classId: string }>>;
  let service: ApprovalService;
  let classState: { owner: string; status: string };

  const as = (user: { id: string; role: UserRole }) => {
    store.users[user.id] = user;
    jwt.verifyAsync.mockResolvedValue({ sub: user.id, type: "access" });
  };

  const ask = (over: Record<string, unknown> = {}) =>
    service.create("t", {
      actionType: "CLASS_CANCEL",
      payload: { classId: "class-1" },
      reason: "Coach is unwell",
      ...over
    } as never);

  beforeEach(() => {
    store = makeStore();
    jwt = { verifyAsync: jest.fn() };
    classState = { owner: "coach-1", status: "SCHEDULED" };
    handler = {
      actionType: "CLASS_CANCEL",
      payloadSchema: z.object({ classId: z.string().min(1) }),
      prepare: jest.fn(async (_tx, requester, payload) => {
        if (classState.owner !== requester.id) throw new NotFoundException("Class not found.");
        return {
          classId: payload.classId,
          currentValue: { status: classState.status },
          dedupeKey: `CLASS_CANCEL:${payload.classId}`,
          requestedValue: { status: "CANCELLED" }
        };
      }),
      revalidate: jest.fn(async () => {
        if (classState.status !== "SCHEDULED") throw new ConflictException("The class changed since the request.");
      }),
      execute: jest.fn(async () => {
        classState.status = "CANCELLED";
        return { cancelled: true };
      }),
      afterCommit: jest.fn()
    } as unknown as jest.Mocked<ApprovalHandler<{ classId: string }>>;
    service = new ApprovalService(
      jwt as unknown as JwtService,
      store.prisma as unknown as PrismaService,
      createJobLockStub() as unknown as JobLockService,
      [handler as unknown as ApprovalHandler]
    );
  });

  it("only registers handlers that are in the shared catalogue", () => {
    for (const type of service.registeredActionTypes()) {
      expect(Object.keys(APPROVAL_ACTIONS)).toContain(type);
    }
  });

  describe("create", () => {
    it("records a PENDING request with a CREATED event and the handler's snapshot", async () => {
      as(coach);
      const { request } = await ask();
      expect(request).toMatchObject({
        actionType: "CLASS_CANCEL",
        category: "SCHEDULING",
        classId: "class-1",
        currentValue: { status: "SCHEDULED" },
        requesterRole: "COACH",
        status: "PENDING"
      });
      expect(store.events()).toEqual([expect.objectContaining({ type: "CREATED", actorId: "coach-1" })]);
      expect(handler.afterCommit).toHaveBeenCalledWith(expect.anything(), "CREATED");
    });

    it("refuses a role the catalogue doesn't allow to ask", async () => {
      as(student);
      await expect(ask()).rejects.toBeInstanceOf(ForbiddenException);
      as(admin);
      await expect(ask()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuses an action with no registered handler", async () => {
      as(coach);
      await expect(ask({ actionType: "LIVE_CLASS_GUEST_STUDENT" })).rejects.toBeInstanceOf(BadRequestException);
    });

    it("validates the payload with the handler's schema (400, not 500)", async () => {
      as(coach);
      await expect(ask({ payload: { classId: "" } })).rejects.toBeInstanceOf(BadRequestException);
      expect(handler.prepare).not.toHaveBeenCalled();
    });

    it("lets the handler refuse out-of-scope requests (another coach's class)", async () => {
      as(otherCoach);
      await expect(ask()).rejects.toBeInstanceOf(NotFoundException);
      expect(store.requests()).toHaveLength(0);
    });

    it("refuses a duplicate pending request for the same operation", async () => {
      as(coach);
      await ask();
      await expect(ask()).rejects.toBeInstanceOf(ConflictException);
      expect(store.requests()).toHaveLength(1);
    });

    it("caps expiry at the catalogue TTL and refuses a request that's already too late", async () => {
      as(coach);
      handler.prepare.mockResolvedValueOnce({
        currentValue: null,
        dedupeKey: "k1",
        expiresAt: new Date(Date.now() + 1000 * 3600 * 999),
        requestedValue: {}
      });
      const { request } = await ask();
      expect(new Date(request.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 24 * 3600 * 1000 + 1000);

      handler.prepare.mockResolvedValueOnce({
        currentValue: null,
        dedupeKey: "k2",
        expiresAt: new Date(Date.now() - 1000),
        requestedValue: {}
      });
      await expect(ask()).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("approve", () => {
    it("claims, revalidates, executes and records APPROVED in one transaction", async () => {
      as(coach);
      const { request } = await ask();
      as(admin);
      const res = await service.approve("t", request.id, "ok");

      expect(res.request.status).toBe("APPROVED");
      expect(res.request.reviewerName).toBe("admin-1");
      expect(classState.status).toBe("CANCELLED");
      expect(store.events().map((e) => e.type)).toEqual(["CREATED", "APPROVED"]);
      expect(handler.afterCommit).toHaveBeenLastCalledWith(expect.anything(), "APPROVED");
    });

    it("refuses coaches and students (only reviewers decide)", async () => {
      as(coach);
      const { request } = await ask();
      as(otherCoach);
      await expect(service.approve("t", request.id)).rejects.toBeInstanceOf(ForbiddenException);
      as(student);
      await expect(service.reject("t", request.id, "no way")).rejects.toBeInstanceOf(ForbiddenException);
      expect(classState.status).toBe("SCHEDULED");
    });

    it("never lets anyone decide their own request", async () => {
      as(coach);
      const { request } = await ask();
      // Simulate an admin-requested action (e.g. a future admin→super-admin type).
      store.requests()[0].requesterId = admin.id;
      as(admin);
      await expect(service.approve("t", request.id)).rejects.toThrow("You can't decide your own request.");
      await expect(service.reject("t", request.id, "nope")).rejects.toBeInstanceOf(ForbiddenException);
      expect(handler.execute).not.toHaveBeenCalled();
    });

    it("executes nothing and stays PENDING when the state changed since the request", async () => {
      as(coach);
      const { request } = await ask();
      classState.status = "LIVE"; // e.g. an admin started/changed it meanwhile
      as(admin);

      await expect(service.approve("t", request.id)).rejects.toBeInstanceOf(ConflictException);
      expect(handler.execute).not.toHaveBeenCalled();
      expect(store.requests()[0].status).toBe("PENDING");
      expect(store.requests()[0].reviewerId).toBeNull();
      expect(store.events().map((e) => e.type)).toEqual(["CREATED", "REVALIDATION_FAILED"]);

      // …and the admin can still reject it.
      const res = await service.reject("t", request.id, "Class already started");
      expect(res.request.status).toBe("REJECTED");
    });

    it("rolls back the claim when execution fails", async () => {
      as(coach);
      const { request } = await ask();
      handler.execute.mockRejectedValueOnce(new Error("db down"));
      as(admin);
      await expect(service.approve("t", request.id)).rejects.toThrow("db down");
      expect(store.requests()[0].status).toBe("PENDING");
    });

    it("has exactly one winner when two admins approve at once (no double execution)", async () => {
      as(coach);
      const { request } = await ask();
      as(admin);
      const results = await Promise.allSettled([service.approve("t", request.id), service.approve("t", request.id)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(handler.execute).toHaveBeenCalledTimes(1);
    });

    it("can't replay a decided request, or approve a cancelled one", async () => {
      as(coach);
      const first = await ask();
      as(admin);
      await service.approve("t", first.request.id);
      await expect(service.approve("t", first.request.id)).rejects.toThrow("already approved");
      await expect(service.reject("t", first.request.id, "late")).rejects.toBeInstanceOf(ConflictException);

      classState.status = "SCHEDULED";
      as(coach);
      handler.prepare.mockResolvedValueOnce({ currentValue: null, dedupeKey: "other", requestedValue: {} });
      const second = await ask();
      await service.cancel("t", second.request.id);
      as(admin);
      await expect(service.approve("t", second.request.id)).rejects.toThrow("already cancelled");
      expect(handler.execute).toHaveBeenCalledTimes(1);
    });

    it("can't approve after expiry (and the sweep marks it EXPIRED)", async () => {
      as(coach);
      const { request } = await ask();
      store.requests()[0].expiresAt = new Date(Date.now() - 1000);
      as(admin);
      await expect(service.approve("t", request.id)).rejects.toThrow("expired");
      expect(handler.execute).not.toHaveBeenCalled();

      expect(await service.expireOverdueNow()).toBe(1);
      expect(store.requests()[0].status).toBe("EXPIRED");
      expect(store.events().map((e) => e.type)).toContain("EXPIRED");
    });
  });

  describe("requester reads and cancels", () => {
    it("a requester cancels only their own pending request", async () => {
      as(coach);
      const { request } = await ask();
      as(otherCoach);
      await expect(service.cancel("t", request.id)).rejects.toBeInstanceOf(NotFoundException);
      as(coach);
      const res = await service.cancel("t", request.id);
      expect(res.request.status).toBe("CANCELLED");
      await expect(service.cancel("t", request.id)).rejects.toBeInstanceOf(ConflictException);
    });

    it("another coach can't read the request; the admin list is reviewer-only", async () => {
      as(coach);
      const { request } = await ask();
      as(otherCoach);
      await expect(service.get("t", request.id)).rejects.toBeInstanceOf(NotFoundException);
      expect((await service.listMine("t")).requests).toHaveLength(0);
      await expect(service.list("t", {})).rejects.toBeInstanceOf(ForbiddenException);
      as(admin);
      expect((await service.get("t", request.id)).request.events?.length).toBe(1);
      expect((await service.list("t", { status: "PENDING" })).requests).toHaveLength(1);
    });

    it("the /admin read is reviewer-only, even for the requester", async () => {
      as(coach);
      const { request } = await ask();
      await expect(service.getAsReviewer("t", request.id)).rejects.toBeInstanceOf(ForbiddenException);
      as(admin);
      expect((await service.getAsReviewer("t", request.id)).request.id).toBe(request.id);
    });

    it("requires a rejection reason to be recorded", async () => {
      as(coach);
      const { request } = await ask();
      as(admin);
      const res = await service.reject("t", request.id, "Find a substitute instead");
      expect(res.request.rejectionReason).toBe("Find a substitute instead");
      expect(store.events().at(-1)).toMatchObject({ type: "REJECTED", metadata: { reason: "Find a substitute instead" } });
    });
  });
});
