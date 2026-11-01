import { decodeActivityRunMessage, LIVE_CLASS_ACTIVITY_RUN_TOPIC } from "@nexa-chess/types";
import type { LiveKitService } from "../live-class/livekit.service";
import { ActivityRunEventsService } from "./activity-run-events.service";

const COACH = { identity: "coach_1", metadata: JSON.stringify({ role: "COACH" }) };
const STUDENT = { identity: "student_1", metadata: JSON.stringify({ role: "STUDENT" }) };
const SPECTATOR = { identity: "spectator_admin_1", metadata: JSON.stringify({ role: "SPECTATOR" }) };
const NO_METADATA = { identity: "student_2", metadata: "" };
const BROKEN = { identity: "student_3", metadata: "{" };

const MESSAGE = { runId: "r1", type: "MCQ_ANSWERED" } as const;
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(participants: unknown[]) {
  const livekit = { broadcastData: jest.fn().mockResolvedValue(undefined), listParticipants: jest.fn().mockResolvedValue(participants) };
  return { events: new ActivityRunEventsService(livekit as unknown as LiveKitService), livekit };
}

describe("ActivityRunEventsService", () => {
  it("addresses game data to the class's managers alone", async () => {
    const { events, livekit } = setup([COACH, STUDENT, SPECTATOR, NO_METADATA, BROKEN]);
    events.toManagers("room", MESSAGE);
    await flush();
    expect(livekit.broadcastData).toHaveBeenCalledTimes(1);
    const [room, payload, topic, identities] = livekit.broadcastData.mock.calls[0];
    expect(room).toBe("room");
    expect(topic).toBe(LIVE_CLASS_ACTIVITY_RUN_TOPIC);
    expect(identities).toEqual(["coach_1"]);
    expect(decodeActivityRunMessage(payload)).toEqual(MESSAGE);
  });

  it("sends nothing with no manager connected: an empty address list would mean the whole room", async () => {
    const { events, livekit } = setup([STUDENT]);
    events.toManagers("room", MESSAGE);
    await flush();
    expect(livekit.broadcastData).not.toHaveBeenCalled();
  });

  it("asks LiveKit who is watching at most once per few seconds", async () => {
    const { events, livekit } = setup([COACH]);
    events.toManagers("room", MESSAGE);
    await flush();
    events.toManagers("room", MESSAGE);
    await flush();
    expect(livekit.listParticipants).toHaveBeenCalledTimes(1);
    expect(livekit.broadcastData).toHaveBeenCalledTimes(2);
  });

  it("never lets a LiveKit failure reach a student's move", async () => {
    const { events, livekit } = setup([COACH]);
    livekit.listParticipants.mockRejectedValue(new Error("LiveKit is down"));
    expect(() => events.toManagers("room", MESSAGE)).not.toThrow();
    await flush();
    livekit.broadcastData.mockRejectedValue(new Error("LiveKit is down"));
    await expect(events.toRoom("room", { runId: "r1", type: "RUN_CHANGED" })).resolves.toBeUndefined();
  });

  it("carries lifecycle nudges to the room with no game data in them", async () => {
    const { events, livekit } = setup([]);
    await events.toRoom("room", { runId: "r1", type: "RUN_CHANGED" });
    const [, payload, , identities] = livekit.broadcastData.mock.calls[0];
    expect(identities).toBeUndefined();
    expect(decodeActivityRunMessage(payload)).toEqual({ runId: "r1", type: "RUN_CHANGED" });
  });
});
