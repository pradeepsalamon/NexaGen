import { Test, TestingModule } from "@nestjs/testing";
import type { Request } from "express";
import { JwtService } from "@nestjs/jwt";
import { AttendanceEventType } from "@prisma/client";
import { AttendanceWebhookController } from "./attendance-webhook.controller";
import { AttendanceService } from "./attendance.service";
import { LiveClassService } from "../live-class/live-class.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * P0 reliability Phase 4 (RELIABILITY_DESIGN.md §2.8): two browser tabs of the
 * same student produce interleaved participant_joined/participant_left
 * webhooks on the same ClassAttendance row. Before this phase, a second tab
 * joining ghost-dropped the first tab's still-open session, and the first
 * tab's own later clean leave then closed whatever session was left open —
 * which, after the ghost-drop, was the second tab's — marking the student
 * "left" while they were still actually present via the second tab.
 *
 * These tests cover the two layers of the fix: the webhook controller's
 * join-side decision (does it wrongly ghost-drop a different tab?) and
 * AttendanceService's leave-side session selection (does it close the right
 * tab's session?). The decision logic itself is exhaustively covered in
 * attendance-session.util.spec.ts — these confirm the two callers use it
 * correctly.
 */

describe("Multi-tab attendance — webhook controller join decision", () => {
  let controller: AttendanceWebhookController;
  let attendanceService: {
    recordJoinEvent: jest.Mock;
    recordReconnectEvent: jest.Mock;
    recordLeaveEvent: jest.Mock;
  };
  let prisma: {
    processedWebhookEvent: { create: jest.Mock };
    liveSession: { findUnique: jest.Mock };
    classAttendance: { findUnique: jest.Mock };
    attendanceLog: { findMany: jest.Mock };
  };
  let liveClassService: { endScreenShareOnDisconnect: jest.Mock };
  let receiver: { receive: jest.Mock };

  const CLASS_ID = "class-1";
  const STUDENT_ID = "student-1";
  const COACH_ID = "coach-1";

  const requestWith = (body: string) =>
    ({ body, headers: { authorization: "valid-signature" } }) as unknown as Request;

  beforeEach(() => {
    attendanceService = {
      recordJoinEvent: jest.fn().mockResolvedValue(undefined),
      recordReconnectEvent: jest.fn().mockResolvedValue(undefined),
      recordLeaveEvent: jest.fn().mockResolvedValue(undefined),
    };
    liveClassService = {
      endScreenShareOnDisconnect: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      processedWebhookEvent: { create: jest.fn().mockResolvedValue({}) },
      liveSession: {
        findUnique: jest.fn().mockResolvedValue({ classId: CLASS_ID, coachId: COACH_ID }),
      },
      classAttendance: { findUnique: jest.fn() },
      attendanceLog: { findMany: jest.fn() },
    };

    controller = new AttendanceWebhookController(
      attendanceService as unknown as AttendanceService,
      liveClassService as unknown as LiveClassService,
      prisma as unknown as PrismaService
    );
    receiver = { receive: jest.fn() };
    // The constructor builds its own receiver from env; swap in a stub (same
    // pattern as attendance-webhook.controller.spec.ts).
    (controller as unknown as { webhookReceiver: unknown }).webhookReceiver = receiver;
  });

  const joined = (clientId: string, eventId: string) => ({
    event: "participant_joined",
    id: eventId,
    room: { name: "class_class-1" },
    participant: { identity: `${STUDENT_ID}_${clientId}` },
  });

  const left = (clientId: string, eventId: string) => ({
    event: "participant_left",
    id: eventId,
    room: { name: "class_class-1" },
    participant: { identity: `${STUDENT_ID}_${clientId}` },
  });

  it("does not ghost-drop tab A's open session when tab B joins", async () => {
    // Tab A: first join, no attendance row yet.
    const tabAJoin = joined("tab-a", "evt-1");
    receiver.receive.mockResolvedValueOnce(tabAJoin);
    prisma.classAttendance.findUnique.mockResolvedValueOnce(null);
    await controller.handleWebhook(requestWith(JSON.stringify(tabAJoin)));

    expect(attendanceService.recordJoinEvent).toHaveBeenCalledWith(
      CLASS_ID,
      STUDENT_ID,
      expect.objectContaining({ clientId: "tab-a" })
    );

    // Tab B joins minutes later. Tab A's session (opened well outside the
    // duplicate-join window) is still open.
    const tabBJoin = joined("tab-b", "evt-2");
    receiver.receive.mockResolvedValueOnce(tabBJoin);
    prisma.classAttendance.findUnique.mockResolvedValueOnce({ id: "attendance-1" });
    prisma.attendanceLog.findMany.mockResolvedValueOnce([
      {
        id: "log-tab-a",
        clientId: "tab-a",
        timestamp: new Date(Date.now() - 5 * 60_000),
      },
    ]);
    await controller.handleWebhook(requestWith(JSON.stringify(tabBJoin)));

    // Tab B's join is a concurrent reconnect, not a ghost-drop of tab A.
    expect(attendanceService.recordLeaveEvent).not.toHaveBeenCalled();
    expect(attendanceService.recordReconnectEvent).toHaveBeenCalledWith(
      CLASS_ID,
      STUDENT_ID,
      "tab-b"
    );
  });

  it("closes only the leaving tab's own session, tagging it with its clientId", async () => {
    const tabALeft = left("tab-a", "evt-3");
    receiver.receive.mockResolvedValueOnce(tabALeft);
    await controller.handleWebhook(requestWith(JSON.stringify(tabALeft)));

    expect(attendanceService.recordLeaveEvent).toHaveBeenCalledWith(
      CLASS_ID,
      STUDENT_ID,
      expect.any(String),
      { clientId: "tab-a" }
    );
  });
});

describe("Multi-tab attendance — AttendanceService session selection", () => {
  let service: AttendanceService;
  let prisma: {
    classAttendance: { findUnique: jest.Mock; update: jest.Mock };
    attendanceLog: { findMany: jest.Mock; update: jest.Mock; create: jest.Mock };
  };

  const CLASS_ID = "class-1";
  const STUDENT_ID = "student-1";

  beforeEach(async () => {
    prisma = {
      classAttendance: {
        findUnique: jest.fn().mockResolvedValue({ id: "attendance-1" }),
        update: jest.fn().mockResolvedValue({}),
      },
      attendanceLog: {
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
      ],
    }).compile();

    service = module.get(AttendanceService);
  });

  it("recordLeaveEvent closes tab A's session and leaves tab B's untouched", async () => {
    prisma.attendanceLog.findMany.mockResolvedValueOnce([
      {
        id: "log-tab-a",
        clientId: "tab-a",
        timestamp: new Date("2026-01-01T09:00:00Z"),
        sessionStart: new Date("2026-01-01T09:00:00Z"),
      },
      {
        id: "log-tab-b",
        clientId: "tab-b",
        timestamp: new Date("2026-01-01T09:05:00Z"),
        sessionStart: new Date("2026-01-01T09:05:00Z"),
      },
    ]);

    await service.recordLeaveEvent(CLASS_ID, STUDENT_ID, "Left voluntarily", {
      clientId: "tab-a",
    });

    expect(prisma.attendanceLog.update).toHaveBeenCalledTimes(1);
    expect(prisma.attendanceLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "log-tab-a" } })
    );
    expect(prisma.attendanceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: AttendanceEventType.LEAVE,
          clientId: "tab-a",
        }),
      })
    );
  });

  it("recordLeaveEvent falls back to the most recent open session when clientId is unknown", async () => {
    prisma.attendanceLog.findMany.mockResolvedValueOnce([
      {
        id: "log-older",
        clientId: "tab-a",
        timestamp: new Date("2026-01-01T09:00:00Z"),
        sessionStart: new Date("2026-01-01T09:00:00Z"),
      },
      {
        id: "log-newer",
        clientId: "tab-b",
        timestamp: new Date("2026-01-01T09:05:00Z"),
        sessionStart: new Date("2026-01-01T09:05:00Z"),
      },
    ]);

    await service.recordLeaveEvent(CLASS_ID, STUDENT_ID, "Left voluntarily");

    expect(prisma.attendanceLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "log-newer" } })
    );
  });
});
