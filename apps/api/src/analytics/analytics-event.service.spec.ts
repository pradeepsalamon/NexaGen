import { AnalyticsEventService } from "./analytics-event.service";
import type { PrismaService } from "../prisma/prisma.service";

describe("AnalyticsEventService", () => {
  const makeService = (create: jest.Mock, findFirst = jest.fn()) => {
    const prisma = {
      analyticsEvent: { create, findFirst }
    } as unknown as PrismaService;
    return new AnalyticsEventService(prisma);
  };

  it("records an event", async () => {
    const create = jest.fn().mockResolvedValue({});
    const service = makeService(create);

    await service.record("user-1", "LOGIN");

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "LOGIN",
        entityId: null
      })
    });
  });

  it("passes through an entityId", async () => {
    const create = jest.fn().mockResolvedValue({});
    const service = makeService(create);

    await service.record("user-1", "CLASS_JOIN", "class-9");

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entityId: "class-9" })
    });
  });

  it("swallows a write failure (never rejects)", async () => {
    const create = jest.fn().mockRejectedValue(new Error("db down"));
    const service = makeService(create);

    await expect(service.record("user-1", "LOGIN")).resolves.toBeUndefined();
  });

  it("recordRecordingWatchOncePerDay skips when an event already exists today", async () => {
    const create = jest.fn().mockResolvedValue({});
    const findFirst = jest.fn().mockResolvedValue({ id: "existing" });
    const service = makeService(create, findFirst);

    await service.recordRecordingWatchOncePerDay("user-1", "class-1");

    expect(create).not.toHaveBeenCalled();
  });

  it("recordRecordingWatchOncePerDay writes when nothing exists today", async () => {
    const create = jest.fn().mockResolvedValue({});
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = makeService(create, findFirst);

    await service.recordRecordingWatchOncePerDay("user-1", "class-1");

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "RECORDING_WATCH",
        entityId: "class-1"
      })
    });
  });
});
