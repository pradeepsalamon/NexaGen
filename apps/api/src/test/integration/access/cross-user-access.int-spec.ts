import { API_ROUTES } from "@nexa-chess/types";
import type { User } from "@prisma/client";
import { createTestApp, type TestApp } from "../app";
import { resetDatabase } from "../db";
import { createWorld } from "./world";

type World = Awaited<ReturnType<typeof createWorld>>;
type Case = {
  name: string;
  as: (w: World) => User;
  method?: "GET" | "PATCH" | "POST" | "PUT" | "DELETE";
  path: (w: World) => string;
  body?: unknown | ((w: World) => unknown);
};

const DUE_TOMORROW = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

// Every route here has a twin in OWN_CASES on the caller's own data (where a
// GET exists), so a denial can't pass just because the route itself is broken.
const CROSS_USER: Case[] = [
  // Student A reaching student B
  { name: "student opens a class of another batch", as: (w) => w.a.student, path: (w) => API_ROUTES.student.classDetail(w.b.class.id) },
  { name: "student reads another student's progress", as: (w) => w.a.student, path: (w) => API_ROUTES.progress.student(w.b.student.id) },
  { name: "student reads another student's attendance", as: (w) => w.a.student, path: (w) => API_ROUTES.attendance.studentById(w.b.student.id) },
  { name: "student reads another student's invoice", as: (w) => w.a.student, path: (w) => API_ROUTES.invoices.get(w.b.invoice.id) },
  { name: "student reads another student's invoice HTML", as: (w) => w.a.student, path: (w) => API_ROUTES.invoices.html(w.b.invoice.id) },
  { name: "student reads another student's puzzle attempt", as: (w) => w.a.student, path: (w) => API_ROUTES.puzzles.attempt(w.b.privatePuzzle.id, w.b.attempt.id) },
  { name: "student opens another coach's private puzzle", as: (w) => w.a.student, path: (w) => API_ROUTES.puzzles.mineGet(w.b.privatePuzzle.id) },
  { name: "student opens another student's assignment", as: (w) => w.a.student, path: (w) => API_ROUTES.assignments.mineGet(w.b.studentAssignment.id) },
  { name: "student starts an attempt on another student's assignment", as: (w) => w.a.student, method: "POST", path: (w) => API_ROUTES.assignments.attempts(w.b.studentAssignment.id) },
  { name: "student starts a puzzle of another student's puzzle set", as: (w) => w.a.student, method: "POST", path: (w) => API_ROUTES.assignments.puzzleAttempts(w.b.setStudentAssignment.id, w.b.privatePuzzle.id) },
  { name: "student starts a puzzle of their own set that is not in it", as: (w) => w.a.student, method: "POST", path: (w) => API_ROUTES.assignments.puzzleAttempts(w.a.setStudentAssignment.id, w.b.privatePuzzle.id) },
  { name: "student reads another student's puzzle-set leaderboard", as: (w) => w.a.student, path: (w) => API_ROUTES.assignments.leaderboard(w.b.setStudentAssignment.id) },
  { name: "coach reads another coach's puzzle-set results", as: (w) => w.a.coach, path: (w) => API_ROUTES.assignments.deployment(w.b.setDeployment.id) },
  // Coach A reaching coach B
  { name: "coach reads a student outside their batches (progress)", as: (w) => w.a.coach, path: (w) => API_ROUTES.progress.student(w.b.student.id) },
  { name: "coach reads another coach's class", as: (w) => w.a.coach, path: (w) => API_ROUTES.coach.getClass(w.b.class.id) },
  { name: "coach reads another coach's class details", as: (w) => w.a.coach, path: (w) => API_ROUTES.coach.classDetails(w.b.class.id) },
  { name: "coach edits another coach's class notes", as: (w) => w.a.coach, method: "PATCH", path: (w) => API_ROUTES.coach.updateClass(w.b.class.id), body: { notes: "hijacked" } },
  { name: "coach reads another coach's class attendance", as: (w) => w.a.coach, path: (w) => API_ROUTES.attendance.class(w.b.class.id) },
  { name: "coach reads another class's attendance logs", as: (w) => w.a.coach, path: (w) => API_ROUTES.attendance.classLogs(w.b.class.id, w.b.student.id) },
  { name: "coach reads another coach's attendance stats", as: (w) => w.a.coach, path: (w) => API_ROUTES.attendance.coachById(w.b.coach.id) },
  { name: "coach reads another coach's batch", as: (w) => w.a.coach, path: (w) => API_ROUTES.batches.get(w.b.batch.id) },
  { name: "coach opens another coach's private puzzle", as: (w) => w.a.coach, path: (w) => API_ROUTES.puzzles.get(w.b.privatePuzzle.id) },
  { name: "coach edits another coach's private puzzle", as: (w) => w.a.coach, method: "PATCH", path: (w) => API_ROUTES.puzzles.update(w.b.privatePuzzle.id), body: { title: "hijacked" } },
  { name: "coach deletes another coach's private puzzle", as: (w) => w.a.coach, method: "DELETE", path: (w) => API_ROUTES.puzzles.delete(w.b.privatePuzzle.id) },
  { name: "coach reads another coach's payroll record", as: (w) => w.a.coach, path: (w) => API_ROUTES.payroll.record(w.b.payrollRecord.id) },
  { name: "coach reads another coach's assignment", as: (w) => w.a.coach, path: (w) => API_ROUTES.assignments.get(w.b.assignment.id) },
  { name: "coach edits another coach's assignment", as: (w) => w.a.coach, method: "PATCH", path: (w) => API_ROUTES.assignments.update(w.b.assignment.id), body: { title: "hijacked" } },
  { name: "coach reads another coach's deployment", as: (w) => w.a.coach, path: (w) => API_ROUTES.assignments.deployment(w.b.deployment.id) },
  { name: "coach undeploys another coach's assignment", as: (w) => w.a.coach, method: "DELETE", path: (w) => API_ROUTES.assignments.undeploy(w.b.deployment.id) },
  { name: "coach deploys homework to another coach's batch", as: (w) => w.a.coach, method: "POST", path: () => API_ROUTES.assignments.deploy, body: (w: World) => ({ assignmentId: w.a.assignment.id, batchIds: [w.b.batch.id], dueDate: DUE_TOMORROW() }) },
  { name: "coach lists another batch's students for a manual payment", as: (w) => w.a.coach, path: (w) => API_ROUTES.payments.manual.batchStudents(w.b.batch.id) },
  { name: "coach lists another batch's plans for a manual payment", as: (w) => w.a.coach, path: (w) => API_ROUTES.payments.manual.batchPlans(w.b.batch.id) },
  // In-room routes on B's LIVE class
  { name: "student reads another class's chat", as: (w) => w.a.student, path: (w) => API_ROUTES.liveClass.chat(w.b.liveClass.id) },
  { name: "student posts into another class's chat", as: (w) => w.a.student, method: "POST", path: (w) => API_ROUTES.liveClass.chat(w.b.liveClass.id), body: { message: "intruder" } },
  { name: "student reads another class's leaderboard", as: (w) => w.a.student, path: (w) => API_ROUTES.liveClass.puzzleClassLeaderboard(w.b.liveClass.id) },
  { name: "student takes a join token for another class", as: (w) => w.a.student, method: "POST", path: (w) => API_ROUTES.liveClass.token(w.b.liveClass.id) },
  { name: "coach reads another coach's class chat", as: (w) => w.a.coach, path: (w) => API_ROUTES.liveClass.chat(w.b.liveClass.id) },
  { name: "coach reads another class's pull roster", as: (w) => w.a.coach, path: (w) => API_ROUTES.liveClass.pullRoster(w.b.liveClass.id) },
  { name: "coach reads another class's simul", as: (w) => w.a.coach, path: (w) => API_ROUTES.liveClass.simul(w.b.liveClass.id) },
  { name: "coach ends another coach's class", as: (w) => w.a.coach, method: "POST", path: (w) => API_ROUTES.liveClass.end(w.b.liveClass.id) },
  { name: "coach kicks a student from another coach's class", as: (w) => w.a.coach, method: "POST", path: (w) => API_ROUTES.liveClass.kick(w.b.liveClass.id), body: (w: World) => ({ identity: w.b.student.id }) },
  { name: "coach force-mutes in another coach's class", as: (w) => w.a.coach, method: "POST", path: (w) => API_ROUTES.liveClass.moderate(w.b.liveClass.id), body: { identity: "x", source: "microphone" } },
  { name: "coach asks a student in another coach's class to unmute", as: (w) => w.a.coach, method: "POST", path: (w) => API_ROUTES.liveClass.requestTrackOn(w.b.liveClass.id), body: { identity: "x", source: "microphone" } },
  { name: "student asks another student to unmute", as: (w) => w.a.student, method: "POST", path: (w) => API_ROUTES.liveClass.requestTrackOn(w.a.liveClass.id), body: { identity: "x", source: "camera" } },
  { name: "student reads another class's classroom tools", as: (w) => w.a.student, path: (w) => API_ROUTES.liveClass.tools(w.b.liveClass.id) },
  { name: "coach reads another class's classroom tools", as: (w) => w.a.coach, path: (w) => API_ROUTES.liveClass.tools(w.b.liveClass.id) },
  { name: "coach writes another class's classroom tool", as: (w) => w.a.coach, method: "PUT", path: (w) => API_ROUTES.liveClass.tool(w.b.liveClass.id, "LEGENDS"), body: { state: { storyId: null } } },
  // Game Library
  { name: "student opens another student's game", as: (w) => w.a.student, path: (w) => API_ROUTES.games.get(w.b.game.id) },
  { name: "student opens the board game of a class they didn't attend", as: (w) => w.a.student, path: (w) => API_ROUTES.games.get(w.b.boardGame.id) },
  { name: "coach opens another coach's game", as: (w) => w.a.coach, path: (w) => API_ROUTES.games.get(w.b.game.id) },
  { name: "coach saves analysis on another coach's game", as: (w) => w.a.coach, method: "PUT", path: (w) => API_ROUTES.games.saveAnalysis(w.b.game.id), body: { pgn: "1. e4 e5 *", version: 1 } },
  { name: "coach deletes another coach's game", as: (w) => w.a.coach, method: "DELETE", path: (w) => API_ROUTES.games.delete(w.b.game.id) },
  // Chat
  { name: "student reads another batch's group chat", as: (w) => w.a.student, path: (w) => API_ROUTES.chat.messages(w.b.batchChat.id) },
  { name: "student posts into another batch's group chat", as: (w) => w.a.student, method: "POST", path: (w) => API_ROUTES.chat.messages(w.b.batchChat.id), body: { body: "intruder", clientId: "intruder-0001" } },
  { name: "student opens another batch's group chat", as: (w) => w.a.student, path: (w) => API_ROUTES.chat.conversation(w.b.batchChat.id) },
  { name: "student reads another student's DM with their coach", as: (w) => w.a.student, path: (w) => API_ROUTES.chat.messages(w.b.directChat.id) },
  { name: "coach reads another coach's DM", as: (w) => w.a.coach, path: (w) => API_ROUTES.chat.messages(w.b.directChat.id) },
  { name: "coach reads another batch's group chat", as: (w) => w.a.coach, path: (w) => API_ROUTES.chat.messages(w.b.batchChat.id) },
  { name: "coach marks another coach's DM read", as: (w) => w.a.coach, method: "POST", path: (w) => API_ROUTES.chat.markRead(w.b.directChat.id) },
  { name: "student starts a DM with another student", as: (w) => w.a.student, method: "POST", path: () => API_ROUTES.chat.startDirect, body: (w: World) => ({ userId: w.b.student.id }) },
  { name: "student starts a DM with a coach who doesn't teach them", as: (w) => w.a.student, method: "POST", path: () => API_ROUTES.chat.startDirect, body: (w: World) => ({ userId: w.b.coach.id }) },
  { name: "coach starts a DM with another coach's student", as: (w) => w.a.coach, method: "POST", path: () => API_ROUTES.chat.startDirect, body: (w: World) => ({ userId: w.b.student.id }) },
  { name: "coach puts another coach's student in a group", as: (w) => w.a.coach, method: "POST", path: () => API_ROUTES.chat.createGroup, body: (w: World) => ({ memberIds: [w.b.student.id], name: "poach" }) }
];

const OWN_CASES: Case[] = [
  { name: "student reads own progress", as: (w) => w.a.student, path: () => API_ROUTES.progress.mine },
  { name: "student reads own invoice", as: (w) => w.a.student, path: (w) => API_ROUTES.invoices.get(w.a.invoice.id) },
  { name: "student opens own coach's private puzzle", as: (w) => w.a.student, path: (w) => API_ROUTES.puzzles.mineGet(w.a.privatePuzzle.id) },
  { name: "student reads own puzzle attempt", as: (w) => w.a.student, path: (w) => API_ROUTES.puzzles.attempt(w.a.privatePuzzle.id, w.a.attempt.id) },
  { name: "student opens own assignment", as: (w) => w.a.student, path: (w) => API_ROUTES.assignments.mineGet(w.a.studentAssignment.id) },
  { name: "student opens own puzzle set", as: (w) => w.a.student, path: (w) => API_ROUTES.assignments.mineGet(w.a.setStudentAssignment.id) },
  { name: "student reads own puzzle-set leaderboard", as: (w) => w.a.student, path: (w) => API_ROUTES.assignments.leaderboard(w.a.setStudentAssignment.id) },
  { name: "student reads own class chat", as: (w) => w.a.student, path: (w) => API_ROUTES.liveClass.chat(w.a.liveClass.id) },
  { name: "student opens own class", as: (w) => w.a.student, path: (w) => API_ROUTES.student.classDetail(w.a.class.id) },
  { name: "student reads own class leaderboard", as: (w) => w.a.student, path: (w) => API_ROUTES.liveClass.puzzleClassLeaderboard(w.a.liveClass.id) },
  { name: "coach reads own batch", as: (w) => w.a.coach, path: (w) => API_ROUTES.batches.get(w.a.batch.id) },
  { name: "coach reads own class details", as: (w) => w.a.coach, path: (w) => API_ROUTES.coach.classDetails(w.a.class.id) },
  { name: "coach reads own student's progress", as: (w) => w.a.coach, path: (w) => API_ROUTES.progress.student(w.a.student.id) },
  { name: "coach reads own class", as: (w) => w.a.coach, path: (w) => API_ROUTES.coach.getClass(w.a.class.id) },
  { name: "coach reads own class attendance", as: (w) => w.a.coach, path: (w) => API_ROUTES.attendance.class(w.a.class.id) },
  { name: "coach opens own private puzzle", as: (w) => w.a.coach, path: (w) => API_ROUTES.puzzles.get(w.a.privatePuzzle.id) },
  { name: "coach reads own payroll record", as: (w) => w.a.coach, path: (w) => API_ROUTES.payroll.record(w.a.payrollRecord.id) },
  { name: "coach reads own assignment", as: (w) => w.a.coach, path: (w) => API_ROUTES.assignments.get(w.a.assignment.id) },
  { name: "coach reads own deployment", as: (w) => w.a.coach, path: (w) => API_ROUTES.assignments.deployment(w.a.deployment.id) },
  { name: "coach reads own puzzle-set results", as: (w) => w.a.coach, path: (w) => API_ROUTES.assignments.deployment(w.a.setDeployment.id) },
  { name: "coach lists own batch's students for a manual payment", as: (w) => w.a.coach, path: (w) => API_ROUTES.payments.manual.batchStudents(w.a.batch.id) },
  { name: "coach reads own class pull roster", as: (w) => w.a.coach, path: (w) => API_ROUTES.liveClass.pullRoster(w.a.liveClass.id) },
  { name: "coach reads own class simul", as: (w) => w.a.coach, path: (w) => API_ROUTES.liveClass.simul(w.a.liveClass.id) },
  { name: "student reads own class's classroom tools", as: (w) => w.a.student, path: (w) => API_ROUTES.liveClass.tools(w.a.liveClass.id) },
  { name: "coach writes own class's classroom tool", as: (w) => w.a.coach, method: "PUT", path: (w) => API_ROUTES.liveClass.tool(w.a.liveClass.id, "LEGENDS"), body: { state: { storyId: null } } },
  { name: "ADMIN lists every live class (Live Now)", as: (w) => w.admin, path: () => API_ROUTES.adminLiveClasses.list },
  { name: "student opens own game", as: (w) => w.a.student, path: (w) => API_ROUTES.games.get(w.a.game.id) },
  { name: "student opens the board game of a class they attended", as: (w) => w.a.student, path: (w) => API_ROUTES.games.get(w.a.boardGame.id) },
  { name: "coach opens own class's game", as: (w) => w.a.coach, path: (w) => API_ROUTES.games.get(w.a.game.id) },
  { name: "coach saves analysis on own class's game", as: (w) => w.a.coach, method: "PUT", path: (w) => API_ROUTES.games.saveAnalysis(w.a.game.id), body: { pgn: "1. e4 (1. d4) *", version: 1 } },
  { name: "ADMIN opens any game", as: (w) => w.admin, path: (w) => API_ROUTES.games.get(w.b.game.id) },
  { name: "student reads own batch's group chat", as: (w) => w.a.student, path: (w) => API_ROUTES.chat.messages(w.a.batchChat.id) },
  { name: "student reads own DM with their coach", as: (w) => w.a.student, path: (w) => API_ROUTES.chat.messages(w.a.directChat.id) },
  { name: "coach reads own DM", as: (w) => w.a.coach, path: (w) => API_ROUTES.chat.messages(w.a.directChat.id) },
  { name: "coach reads own batch's group chat", as: (w) => w.a.coach, path: (w) => API_ROUTES.chat.conversation(w.a.batchChat.id) },
  { name: "student's chat unread count", as: (w) => w.a.student, path: () => API_ROUTES.chat.unread },
  { name: "student's own assignment reminders", as: (w) => w.a.student, path: () => API_ROUTES.assignments.reminders }
];

// Lists must not mention the other side's rows at all.
const LIST_CASES: Case[] = [
  { name: "student's batch list (scoped, not forbidden)", as: (w) => w.a.student, path: () => API_ROUTES.batches.list },
  { name: "coach's /batches list", as: (w) => w.a.coach, path: () => API_ROUTES.batches.list },
  { name: "student's invoice list", as: (w) => w.a.student, path: () => API_ROUTES.invoices.mine },
  { name: "student's puzzle list", as: (w) => w.a.student, path: () => API_ROUTES.puzzles.mine },
  { name: "student's assignments", as: (w) => w.a.student, path: () => API_ROUTES.assignments.mine },
  { name: "coach's student list", as: (w) => w.a.coach, path: () => API_ROUTES.coach.students },
  { name: "coach's batch list", as: (w) => w.a.coach, path: () => API_ROUTES.coach.batches },
  { name: "coach's class list", as: (w) => w.a.coach, path: () => API_ROUTES.coach.classes },
  { name: "coach's puzzle library", as: (w) => w.a.coach, path: () => API_ROUTES.puzzles.list },
  { name: "coach's payroll", as: (w) => w.a.coach, path: () => API_ROUTES.payroll.mine },
  { name: "coach's assignment library", as: (w) => w.a.coach, path: () => API_ROUTES.assignments.library },
  { name: "coach's deployments", as: (w) => w.a.coach, path: () => API_ROUTES.assignments.deployments },
  { name: "coach's manual payments", as: (w) => w.a.coach, path: () => API_ROUTES.payments.manual.mine },
  { name: "student's Game Library", as: (w) => w.a.student, path: () => API_ROUTES.games.list },
  { name: "coach's Game Library", as: (w) => w.a.coach, path: () => API_ROUTES.games.list },
  { name: "coach's Game Library filters", as: (w) => w.a.coach, path: () => API_ROUTES.games.filterOptions },
  { name: "student's conversations", as: (w) => w.a.student, path: () => API_ROUTES.chat.conversations },
  { name: "coach's conversations", as: (w) => w.a.coach, path: () => API_ROUTES.chat.conversations },
  { name: "student's chat contacts", as: (w) => w.a.student, path: () => API_ROUTES.chat.contacts },
  { name: "coach's chat contacts", as: (w) => w.a.coach, path: () => API_ROUTES.chat.contacts },
  { name: "student's assignment reminders", as: (w) => w.a.student, path: () => API_ROUTES.assignments.reminders },
  { name: "coach's assignment overview", as: (w) => w.a.coach, path: () => API_ROUTES.assignments.overview },
  { name: "coach's assignment overview filtered to another coach's batch", as: (w) => w.a.coach, path: (w) => `${API_ROUTES.assignments.overview}?batchId=${w.b.batch.id}` }
];

const WRONG_ROLE: Case[] = [
  { name: "student lists users", as: (w) => w.a.student, path: () => API_ROUTES.users.list },
  { name: "coach lists users", as: (w) => w.a.coach, path: () => API_ROUTES.users.list },
  { name: "student reads admin invoices", as: (w) => w.a.student, path: () => API_ROUTES.adminInvoices.list },
  { name: "coach reads admin payments", as: (w) => w.a.coach, path: () => API_ROUTES.adminPayments.list },
  { name: "coach reads payroll periods", as: (w) => w.a.coach, path: () => API_ROUTES.adminPayroll.periods },
  { name: "student reads a class through the coach route", as: (w) => w.a.student, path: (w) => API_ROUTES.coach.getClass(w.a.class.id) },
  { name: "student creates a batch", as: (w) => w.a.student, method: "POST", path: () => API_ROUTES.batches.create, body: { name: "x" } },
  { name: "student writes their own class's classroom tool", as: (w) => w.a.student, method: "PUT", path: (w) => API_ROUTES.liveClass.tool(w.a.liveClass.id, "LEGENDS"), body: { state: { storyId: null } } },
  { name: "coach lists every live class (admin only)", as: (w) => w.a.coach, path: () => API_ROUTES.adminLiveClasses.list },
  { name: "student lists every live class (admin only)", as: (w) => w.a.student, path: () => API_ROUTES.adminLiveClasses.list },
  { name: "coach takes a spectator seat in their own class (admin only)", as: (w) => w.a.coach, method: "POST", path: (w) => API_ROUTES.adminLiveClasses.spectate(w.a.liveClass.id) },
  { name: "student takes a spectator seat in their own class (admin only)", as: (w) => w.a.student, method: "POST", path: (w) => API_ROUTES.adminLiveClasses.spectate(w.a.liveClass.id) },
  { name: "ADMIN opens the trash (super-admin only)", as: (w) => w.admin, path: () => API_ROUTES.trash.list },
  { name: "ADMIN lists demo classes (super-admin only)", as: (w) => w.admin, path: () => API_ROUTES.admin.demoClasses },
  { name: "student imports a game", as: (w) => w.a.student, method: "POST", path: () => API_ROUTES.games.import, body: { pgn: "1. e4 *" } },
  { name: "student saves analysis on their own game", as: (w) => w.a.student, method: "PUT", path: (w) => API_ROUTES.games.saveAnalysis(w.a.game.id), body: { pgn: "1. e4 e5 *", version: 1 } },
  { name: "student reads the coach assignment overview", as: (w) => w.a.student, path: () => API_ROUTES.assignments.overview },
  { name: "coach reads student assignment reminders", as: (w) => w.a.coach, path: () => API_ROUTES.assignments.reminders },
  { name: "student creates a chat group", as: (w) => w.a.student, method: "POST", path: () => API_ROUTES.chat.createGroup, body: (w: World) => ({ memberIds: [w.a.student.id], name: "us" }) }
];

describe("cross-user access (real app, real Postgres)", () => {
  let t: TestApp;
  let w: World;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
  });
  afterAll(async () => {
    await t?.close();
  });

  const run = (c: Case) =>
    t.call(c.as(w), c.method ?? "GET", c.path(w), typeof c.body === "function" ? c.body(w) : c.body);

  it.each(CROSS_USER.map((c) => [c.name, c] as const))("denies: %s", async (_name, c) => {
    const res = await run(c);
    expect(`${res.status} ${c.path(w)}`).toMatch(/^40[34] /);
  });

  it.each(OWN_CASES.map((c) => [c.name, c] as const))("allows: %s", async (_name, c) => {
    const res = await run(c);
    expect({ path: c.path(w), status: res.status }).toEqual({ path: c.path(w), status: 200 });
  });

  it.each(LIST_CASES.map((c) => [c.name, c] as const))("list hides side B: %s", async (_name, c) => {
    const res = await run(c);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    const b = w.b;
    const ids = [b.student, b.class, b.liveClass, b.batch, b.invoice, b.privatePuzzle, b.payrollRecord, b.assignment, b.deployment, b.studentAssignment, b.game, b.boardGame, b.batchChat, b.directChat].map((row) => row.id);
    for (const id of ids) {
      expect(text).not.toContain(id);
    }
  });

  it.each(WRONG_ROLE.map((c) => [c.name, c] as const))("forbids: %s", async (_name, c) => {
    const res = await run(c);
    expect({ path: c.path(w), status: res.status }).toEqual({ path: c.path(w), status: 403 });
  });

  it("the cross-user writes above changed nothing", async () => {
    const { a, b } = w;
    const klass = await t.prisma.coachClass.findUniqueOrThrow({ where: { id: b.class.id } });
    expect(klass.notes).not.toBe("hijacked");
    expect((await t.prisma.puzzle.findUnique({ where: { id: b.privatePuzzle.id } }))?.title).toBe("Private B");
    expect((await t.prisma.assignment.findUnique({ where: { id: b.assignment.id } }))?.title).toBe("Homework B");
    // The homework + the puzzle set; no third deployment reached B's batch.
    expect(await t.prisma.assignmentBatch.count({ where: { batchId: b.batch.id } })).toBe(2);
    expect(await t.prisma.puzzleAttempt.count({ where: { studentAssignmentId: { not: null } } })).toBe(0);
    expect(await t.prisma.liveSession.findUnique({ where: { classId: b.liveClass.id } })).toMatchObject({ status: "LIVE" });
    expect(await t.prisma.liveChatMessage.count({ where: { senderId: a.student.id } })).toBe(0);
    expect(await t.prisma.chatMessage.count({ where: { senderId: a.student.id } })).toBe(0);
    expect(await t.prisma.chessGame.findUnique({ where: { id: b.game.id } })).toMatchObject({ version: 1 });
    expect(await t.prisma.conversation.count({ where: { type: { in: ["DIRECT", "GROUP"] } } })).toBe(2);
  });
});
