import { ServiceUnavailableException } from "@nestjs/common";
import { parseApiEnv } from "@nexa-chess/config/api";
import { LIVEKIT_NOT_CONFIGURED, LIVEKIT_UNAVAILABLE, LiveKitService } from "./livekit.service";

const startRoomCompositeEgress = jest.fn();
const listParticipants = jest.fn();
const removeParticipant = jest.fn();
const createRoom = jest.fn();

jest.mock("livekit-server-sdk", () => ({
  AccessToken: jest.fn(),
  EgressClient: jest.fn().mockImplementation(() => ({ startRoomCompositeEgress })),
  EncodedFileOutput: jest.fn().mockImplementation((v) => v),
  EncodedFileType: { MP4: 1 },
  EncodingOptionsPreset: { H264_720P_30: 0 },
  RoomServiceClient: jest.fn().mockImplementation(() => ({ createRoom, listParticipants, removeParticipant })),
  S3Upload: jest.fn().mockImplementation((v) => v),
  TrackSource: {},
  DataPacket_Kind: { RELIABLE: 0 },
}));

const env: Record<string, unknown> = {};
jest.mock("@nexa-chess/config/api", () => ({
  ...jest.requireActual("@nexa-chess/config/api"),
  getApiEnv: () => env,
}));

/**
 * The template URL is what makes a recording contain the chessboard: without it
 * egress falls back to its built-in grid, which renders published video tracks
 * only and captures no board at all.
 */
describe("LiveKitService recording template", () => {
  let service: LiveKitService;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(env)) delete env[k];
    Object.assign(env, {
      LIVEKIT_URL: "ws://livekit:7880",
      LIVEKIT_API_KEY: "key",
      LIVEKIT_API_SECRET: "secret",
      RECORDING_STORAGE_TARGET: "local",
    });
    startRoomCompositeEgress.mockResolvedValue({ egressId: "EG_test" });
    service = new LiveKitService();
    service.onModuleInit();
  });

  it("points egress at the class's recording template", async () => {
    env.RECORDING_TEMPLATE_BASE_URL = "http://web:3000";

    await service.startRecording("class_abc", "recordings/class_abc-1.mp4", "abc");

    const [, , options] = startRoomCompositeEgress.mock.calls[0];
    expect(options.customBaseUrl).toBe("http://web:3000/recorder/abc");
    expect(options.encodingOptions).toBe(0); // H264_720P_30 — the template's frame
  });

  it("tolerates a trailing slash on the configured base URL", async () => {
    env.RECORDING_TEMPLATE_BASE_URL = "http://web:3000/";

    await service.startRecording("class_abc", "recordings/class_abc-1.mp4", "abc");

    expect(startRoomCompositeEgress.mock.calls[0][2].customBaseUrl).toBe(
      "http://web:3000/recorder/abc"
    );
  });

  it("falls back to the built-in grid when no template is configured", async () => {
    delete env.RECORDING_TEMPLATE_BASE_URL;

    await service.startRecording("class_abc", "recordings/class_abc-1.mp4", "abc");

    const [, , options] = startRoomCompositeEgress.mock.calls[0];
    expect(options.customBaseUrl).toBeUndefined();
    expect(options.layout).toBe("grid");
  });

  it("writes to the local volume as an absolute path unless OCI is opted into", async () => {
    await service.startRecording("class_abc", "recordings/class_abc-1.mp4", "abc");

    const [, output] = startRoomCompositeEgress.mock.calls[0];
    expect(output.file.filepath).toBe("/recordings/class_abc-1.mp4");
    expect(output.file.output).toBeUndefined();
  });
});

describe("LiveKitService failures", () => {
  const configure = (configured: boolean) => {
    for (const k of Object.keys(env)) delete env[k];
    if (configured) Object.assign(env, { LIVEKIT_API_KEY: "key", LIVEKIT_API_SECRET: "secret", LIVEKIT_URL: "ws://livekit:7880" });
    const service = new LiveKitService();
    service.onModuleInit();
    return service;
  };

  beforeEach(() => jest.clearAllMocks());

  it("boots without LiveKit outside production and answers 503 instead", async () => {
    const service = configure(false);
    expect(service.isConfigured()).toBe(false);
    await expect(service.listParticipants("class_a")).rejects.toThrow(new ServiceUnavailableException(LIVEKIT_NOT_CONFIGURED));
    await expect(service.createRoom("class_a")).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      service.generateAccessToken({ participantIdentity: "u", participantName: "U", roomName: "class_a" } as never)
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.startRecording("class_a", "r.mp4", "a")).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("turns a LiveKit outage into a 503, not a 500", async () => {
    const service = configure(true);
    listParticipants.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:7880"), { code: "ECONNREFUSED" }));
    createRoom.mockRejectedValue(new Error("socket hang up"));
    await expect(service.listParticipants("class_a")).rejects.toThrow(new ServiceUnavailableException(LIVEKIT_UNAVAILABLE));
    await expect(service.createRoom("class_a")).rejects.toThrow(new ServiceUnavailableException(LIVEKIT_UNAVAILABLE));
  });

  it("still treats a room that doesn't exist yet as empty", async () => {
    const service = configure(true);
    listParticipants.mockRejectedValue(Object.assign(new Error("requested room does not exist"), { code: "not_found" }));
    await expect(service.listParticipants("class_a")).resolves.toEqual([]);
  });

  it("passes a participant-not-found error through for the caller to judge", async () => {
    const service = configure(true);
    const notFound = Object.assign(new Error("participant not found"), { code: "not_found" });
    removeParticipant.mockRejectedValue(notFound);
    await expect(service.removeParticipant("class_a", "u")).rejects.toBe(notFound);
  });
});

describe("LIVEKIT_* configuration", () => {
  const production = {
    JWT_ACCESS_SECRET: "a".repeat(40),
    JWT_REFRESH_SECRET: "b".repeat(40),
    MFA_REQUIRED_ROLES: "NONE",
    NODE_ENV: "production",
  };

  it("is optional outside production", () => {
    expect(() => parseApiEnv({ NODE_ENV: "development" })).not.toThrow();
  });

  it("refuses to boot production without it", () => {
    expect(() => parseApiEnv(production)).toThrow(/LIVEKIT_URL is required in production/);
    expect(() =>
      parseApiEnv({ ...production, LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s", LIVEKIT_URL: "ws://livekit:7880" })
    ).not.toThrow();
  });
});
