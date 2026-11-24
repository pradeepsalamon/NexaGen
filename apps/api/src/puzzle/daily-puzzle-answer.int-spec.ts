import { API_ROUTES, type DailyPuzzlePictureResponse, type DailyPuzzleTodayResponse } from "@nexa-chess/types";
import { PuzzleDifficulty, PuzzleStatus, PuzzleType, PuzzleVisibility, UserRole, UserStatus, type User } from "@prisma/client";
import { dailyPuzzleDedupeKey } from "../messaging/daily-puzzle-deliveries";
import { runInTenant } from "../tenancy/tenant-context";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { DailyPuzzleAnswerService } from "./daily-puzzle-answer.service";
import { pictureTokenFromLink } from "./daily-puzzle-picture";
import { DailyPuzzleWhatsAppService } from "./daily-puzzle-whatsapp.service";

// Puzzle of the Day step 3 on real Postgres (docs/PUZZLE_OF_THE_DAY.md): the
// signed board picture, and answering by WhatsApp reply: only for a number that
// got today's picture, only for the one student whose account phone it is,
// first move only, the admin's try limits, the student's own entry and streak.

// White mates with Ra8#; Kf1, Ra2, … are legal and wrong; Qh5 is not a move here.
const FEN = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";
const SAM = "919876543210";
const TARA = "919555555555";
const SHARED = "919111111111";
const LINK = "https://academy.test/student/daily-puzzle";

describe("Puzzle of the Day answered on WhatsApp (real Postgres)", () => {
  let t: TestApp;
  let admin: User;
  let sam: User;
  let tara: User;
  let today: string;
  let picturePath: string;

  const db = <T>(fn: () => Promise<T>) => runInTenant("tenant_nexa", "spec", fn);
  const reply = async (waId: string, text: string) => {
    const outcome = await db(() =>
      t.prisma.$transaction((tx) => t.app.get(DailyPuzzleAnswerService).reply(tx, waId, text, LINK))
    );
    outcome?.afterCommit.forEach((work) => work());
    return outcome?.replies ?? null;
  };
  async function student(firstName: string, phoneNumber: string) {
    const user = await createUser(t.prisma, UserRole.STUDENT);
    await t.prisma.studentProfile.create({ data: { parentName: "Parent", userId: user.id } });
    return t.prisma.user.update({ data: { firstName, phoneNumber, status: UserStatus.ACTIVE }, where: { id: user.id } });
  }
  const sent = (phone: string) =>
    t.prisma.messageDelivery.create({
      data: {
        body: "Puzzle of the Day",
        channel: "WHATSAPP",
        dedupeKey: dailyPuzzleDedupeKey(phone, today),
        event: "DAILY_PUZZLE",
        imageLink: `https://academy.test${picturePath}`,
        recipientPhone: phone,
        scheduledFor: new Date(),
        status: "SENT"
      }
    });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    jest.spyOn(t.app.get(WhatsAppService), "isConfigured").mockReturnValue(true);
    admin = await t.prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { id: (await createUser(t.prisma, UserRole.ADMIN)).id } });
    sam = await student("Sam", "+91 98765 43210");
    tara = await student("Tara", TARA);
    const ann = await student("Ann", SHARED);
    const ben = await student("Ben", "+91 91111 11111");
    const batch = await t.prisma.batch.create({ data: { name: "A" } });
    await t.prisma.batchStudent.createMany({
      data: [sam, tara, ann, ben].map((s) => ({ batchId: batch.id, studentId: s.id }))
    });
    const topic = await t.prisma.puzzleTopic.create({ data: { name: "Mates", slug: "mates" } });
    for (const [title, rating] of [["Easy", 1000], ["Medium", 1300], ["Hard", 1700]] as const) {
      await t.prisma.puzzle.create({
        data: {
          createdByRole: UserRole.ADMIN,
          difficulty: PuzzleDifficulty.INTERMEDIATE,
          fen: FEN,
          puzzleType: PuzzleType.CHECKMATE,
          rating,
          solutionMovesJson: [{ san: "Ra8#", uci: "a1a8" }],
          status: PuzzleStatus.PUBLISHED,
          title,
          topicId: topic.id,
          visibility: PuzzleVisibility.GLOBAL
        }
      });
    }
    const rule = await t.call(admin, "PUT", API_ROUTES.messaging.rule("DAILY_PUZZLE"), { enabled: true, scheduleHour: 7, scheduleMode: "DAILY" });
    expect(rule.status).toBe(200);
    today = ((await t.call(sam, "GET", API_ROUTES.dailyPuzzle.today)).body as DailyPuzzleTodayResponse).day;
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await t?.close();
  });

  it("signs a picture of the academy's puzzle at the pictured level, and draws it only for a genuine link", async () => {
    picturePath = (await db(() => t.app.get(DailyPuzzleWhatsAppService).picturePathFor("tenant_nexa", today, sam.id)))!;
    expect(picturePath).toMatch(/^\/daily-puzzle-picture\/[\w-]+\.[\w-]+\.png$/);
    const token = pictureTokenFromLink(picturePath)!;

    const res = await t.call(null, "GET", API_ROUTES.dailyPuzzle.picture(token));
    expect(res.status).toBe(200);
    expect(res.body as DailyPuzzlePictureResponse).toEqual({ boardTheme: "nexa-classic", fen: FEN, flip: false, pieceSet: "classic" });
    // The academy-wide Medium puzzle was picked for it.
    const medium = await t.prisma.puzzle.findFirstOrThrow({ where: { title: "Medium" } });
    expect(await t.prisma.dailyPuzzle.count({ where: { level: "MEDIUM", puzzleId: medium.id, scopeKey: "academy" } })).toBe(1);

    const [payload, signature] = token.split(".");
    const forged = `${payload.slice(0, -2)}AA.${signature}`;
    expect((await t.call(null, "GET", API_ROUTES.dailyPuzzle.picture(forged))).status).toBe(404);
    expect((await t.call(null, "GET", API_ROUTES.dailyPuzzle.picture("nonsense"))).status).toBe(404);
  });

  it("ignores text that isn't about the puzzle, and numbers that didn't get today's picture", async () => {
    await sent(SAM);
    await sent(SHARED);
    expect(await reply(SAM, "hello")).toBeNull();
    expect(await reply(SAM, "2")).toBeNull();
    // Tara's message hasn't gone out: her move is ordinary text for the bot.
    expect(await reply(TARA, "Ra8")).toBeNull();
  });

  it("tells a number shared by two students to use the app", async () => {
    const replies = await reply(SHARED, "Ra8#");
    expect(replies?.[0]).toContain("More than one student uses this number");
    expect(replies?.[0]).toContain(LINK);
  });

  it("checks the first move with the engine, counts wrong tries, and gives a hint after the first", async () => {
    expect((await reply(SAM, "Qh5"))?.[0]).toContain("isn't possible in the puzzle position (White to move)");
    expect((await reply(SAM, "HINT"))?.[0]).toBe("You can ask for a hint after 1 wrong try. Send your move, like Nf3 or e2e4.");
    expect(await reply(SAM, "Kf1")).toEqual(["Not quite. 2 tries left. Reply HINT for a hint."]);
    expect(await reply(SAM, "hint")).toEqual(["Hint: move your rook."]);
    expect((await reply(SAM, "answer"))?.[0]).toBe("You can see the answer after 3 wrong tries. Keep trying!");

    // The student's own entry and DAILY attempt, at the pictured level.
    const entry = await t.prisma.dailyPuzzleEntry.findFirstOrThrow({ include: { attempt: true }, where: { studentId: sam.id } });
    expect(entry).toMatchObject({ finishedAt: null, level: "MEDIUM", whatsappTries: 1 });
    expect(entry.attempt).toMatchObject({ context: "DAILY", hintsUsed: 1, status: "IN_PROGRESS", wrongMoves: 1 });
  });

  it("a right move (any case for the piece, no # needed) solves the day and keeps the streak", async () => {
    const replies = await reply(SAM, "ra8");
    expect(replies).toEqual([`Correct! 🔥 Ra8# is the move. Your streak: 1 day. More puzzles: ${LINK}`]);
    const entry = await t.prisma.dailyPuzzleEntry.findFirstOrThrow({ include: { attempt: true }, where: { studentId: sam.id } });
    expect(entry).toMatchObject({ solved: true });
    expect(entry.finishedAt).not.toBeNull();
    expect(entry.attempt).toMatchObject({ result: "SOLVED", scorePercent: 100, status: "SOLVED" });
    // The app shows the same day as done.
    expect((await t.call(sam, "GET", API_ROUTES.dailyPuzzle.today)).body).toMatchObject({ doneToday: true, streak: 1 });

    expect((await reply(SAM, "Ra8"))?.[0]).toContain("You've already finished today's Medium puzzle (solved). Your streak: 1 day.");
  });

  it("an admin sets the limits; running out of tries gives the answer and still counts", async () => {
    const bad = await t.call(admin, "PUT", API_ROUTES.dailyPuzzle.settings, {
      whatsapp: { answerAfter: 1, hintAfter: 2, level: "MEDIUM", maxTries: 2 }
    });
    expect(bad.status).toBe(400);
    const ok = await t.call(admin, "PUT", API_ROUTES.dailyPuzzle.settings, {
      whatsapp: { answerAfter: 1, hintAfter: 0, level: "MEDIUM", maxTries: 2 }
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ enabled: true, whatsapp: { answerAfter: 1, hintAfter: 0, level: "MEDIUM", maxTries: 2 } });

    await sent(TARA);
    expect(await reply(TARA, "Kf1")).toEqual(["Not quite. 1 try left. Reply HINT for a hint. Reply ANSWER to see the answer."]);
    expect(await reply(TARA, "a1a2")).toEqual([
      `Not quite. That was your last try: the answer is Ra8#. You finished today's puzzle, so it counts: Your streak: 1 day. ${LINK}`
    ]);
    const entry = await t.prisma.dailyPuzzleEntry.findFirstOrThrow({ include: { attempt: true }, where: { studentId: tara.id } });
    expect(entry).toMatchObject({ solved: false, whatsappTries: 2 });
    expect(entry.attempt).toMatchObject({ status: "FAILED", wrongMoves: 2 });
  });
});
