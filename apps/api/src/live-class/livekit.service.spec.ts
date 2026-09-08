import { LiveKitService } from "./livekit.service";

const startRoomCompositeEgress = jest.fn();

jest.mock("livekit-server-sdk", () => ({
  AccessToken: jest.fn(),
  EgressClient: jest.fn().mockImplementation(() => ({ startRoomCompositeEgress })),
  EncodedFileOutput: jest.fn().mockImplementation((v) => v),
  EncodedFileType: { MP4: 1 },
  EncodingOptionsPreset: { H264_720P_30: 0 },
  RoomServiceClient: jest.fn().mockImplementation(() => ({})),
  S3Upload: jest.fn().mockImplementation((v) => v),
  TrackSource: {},
  DataPacket_Kind: { RELIABLE: 0 },
}));

const env: Record<string, unknown> = {};
jest.mock("@nexa-chess/config/api", () => ({ getApiEnv: () => env }));

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
