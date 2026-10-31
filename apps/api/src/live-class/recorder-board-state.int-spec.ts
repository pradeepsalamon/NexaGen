import { API_ROUTES, type LiveBoardState } from "@nexa-chess/types";
import { AccessToken } from "livekit-server-sdk";
import { createTestApp, type TestApp } from "../test/integration/app";
import { resetDatabase } from "../test/integration/db";
import { createWorld } from "../test/integration/access/world";

const BOARD: LiveBoardState = {
  arrows: [],
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  historyIndex: 0,
  orientation: "black",
  pgn: "1. e4",
  squares: {}
};

/**
 * The egress recording template reads the saved board with the LiveKit token
 * egress minted for it, not a session. Real tokens, signed the way LiveKit
 * signs them, through the real HTTP pipeline.
 */
describe("recorder board-state read (real app, real Postgres)", () => {
  let t: TestApp;
  let classId: string;
  let otherClassId: string;

  // app-env.ts (imported by app.ts) sets these before the app boots.
  const token = async (grant: { room: string; hidden?: boolean; recorder?: boolean }, secret?: string) => {
    const at = new AccessToken(process.env.LIVEKIT_API_KEY, secret ?? process.env.LIVEKIT_API_SECRET, {
      identity: "EG_test"
    });
    at.addGrant({ canPublish: false, canPublishData: false, canSubscribe: true, roomJoin: true, ...grant });
    return at.toJwt();
  };

  const read = async (id: string, authorization?: string) => {
    const res = await fetch(`${t.baseUrl.replace("[::1]", "127.0.0.1")}${API_ROUTES.liveClass.recorderBoardState(id)}`, {
      headers: authorization ? { Authorization: authorization } : {}
    });
    return { body: (await res.json()) as unknown, status: res.status };
  };

  beforeAll(async () => {
    t = await createTestApp();
  }, 60_000);

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    const world = await createWorld(t.prisma);
    classId = world.a.liveClass.id;
    otherClassId = world.b.liveClass.id;
    await t.prisma.liveSession.update({
      data: { boardState: BOARD, boardStateUpdatedAt: new Date() },
      where: { classId }
    });
  });

  afterAll(async () => {
    await t?.close();
  });

  const roomOf = async (id: string) =>
    (await t.prisma.liveSession.findUniqueOrThrow({ select: { roomName: true }, where: { classId: id } })).roomName;

  it("gives the class's recorder the saved board", async () => {
    const res = await read(classId, `Bearer ${await token({ hidden: true, recorder: true, room: await roomOf(classId) })}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: { fen: BOARD.fen, orientation: "black" } });
  });

  it("refuses no token, a forged token, another room's token and a participant's token", async () => {
    const room = await roomOf(classId);
    expect((await read(classId)).status).toBe(401);
    expect((await read(classId, `Bearer ${await token({ hidden: true, recorder: true, room }, "x".repeat(40))}`)).status).toBe(401);
    expect((await read(classId, `Bearer ${await token({ hidden: true, recorder: true, room: await roomOf(otherClassId) })}`)).status).toBe(403);
    expect((await read(classId, `Bearer ${await token({ room })}`)).status).toBe(403);
  });
});
