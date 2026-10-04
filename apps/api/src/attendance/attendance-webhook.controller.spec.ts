import { UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { AttendanceWebhookController } from "./attendance-webhook.controller";
import { AttendanceService } from "./attendance.service";
import { LiveClassRecordingService } from "../live-class/live-class-recording.service";
import { LiveClassScreenShareService } from "../live-class/live-class-screen-share.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The LiveKit webhook is the one unauthenticated entry point into attendance and
 * recording state, so signature handling is covered directly rather than through
 * the service layer.
 */
describe("AttendanceWebhookController signature handling", () => {
  let controller: AttendanceWebhookController;
  let recording: { handleEgressEnded: jest.Mock };
  let prisma: { processedWebhookEvent: { create: jest.Mock } };
  let receiver: { receive: jest.Mock };

  const requestWith = (body: string, authorization?: string) =>
    ({
      body,
      headers: authorization ? { authorization } : {},
    }) as unknown as Request;

  beforeEach(() => {
    recording = { handleEgressEnded: jest.fn().mockResolvedValue(undefined) };
    prisma = { processedWebhookEvent: { create: jest.fn().mockResolvedValue({}) } };
    receiver = { receive: jest.fn() };

    controller = new AttendanceWebhookController(
      {} as unknown as AttendanceService,
      {} as unknown as LiveClassScreenShareService,
      recording as unknown as LiveClassRecordingService,
      prisma as unknown as PrismaService
    );
    // The constructor builds its own receiver from env; swap in a stub.
    (controller as unknown as { webhookReceiver: unknown }).webhookReceiver = receiver;
  });

  it("rejects a payload whose signature does not verify", async () => {
    receiver.receive.mockRejectedValue(new Error("bad signature"));

    await expect(
      controller.handleWebhook(
        requestWith(JSON.stringify({ event: "egress_ended" }), "forged")
      )
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(recording.handleEgressEnded).not.toHaveBeenCalled();
  });

  it("has no bypass header that skips verification", async () => {
    receiver.receive.mockRejectedValue(new Error("bad signature"));

    await expect(
      controller.handleWebhook(
        requestWith(
          JSON.stringify({ event: "egress_ended", egressInfo: { roomName: "class_1" } }),
          "TEST_BYPASS_SIGNATURE"
        )
      )
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(recording.handleEgressEnded).not.toHaveBeenCalled();
  });

  it("processes an egress event once the signature verifies", async () => {
    const event = {
      event: "egress_ended",
      id: "evt-1",
      egressInfo: { egressId: "eg-1", roomName: "class_1", status: 3 },
    };
    receiver.receive.mockResolvedValue(event);

    const result = await controller.handleWebhook(
      requestWith(JSON.stringify(event), "valid-signature")
    );

    expect(result).toEqual({ ok: true });
    expect(recording.handleEgressEnded).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "egress_ended", roomName: "class_1" })
    );
  });

  it("swallows a processing failure so LiveKit does not retry forever", async () => {
    const event = { event: "egress_ended", id: "evt-2", egressInfo: { roomName: "r" } };
    receiver.receive.mockResolvedValue(event);
    recording.handleEgressEnded.mockRejectedValue(new Error("db down"));

    await expect(
      controller.handleWebhook(requestWith(JSON.stringify(event), "valid-signature"))
    ).resolves.toEqual({ ok: false, error: "Processing error" });
  });
});
