import { runInTenant } from "../tenancy/tenant-context";
import { TournamentEventsService } from "./tournament-events.service";
import { TOURNAMENT_TIMER_HORIZON_MS, TournamentTimerService } from "./tournament-timer.service";

describe("TournamentTimerService", () => {
  let events: TournamentEventsService;
  let timers: TournamentTimerService;
  let run: jest.Mock;
  let arm: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    events = new TournamentEventsService();
    timers = new TournamentTimerService(events);
    run = jest.fn().mockResolvedValue(undefined);
    arm = jest.fn().mockResolvedValue(undefined);
    timers.setRunner(run, arm);
    timers.onModuleInit();
  });

  afterEach(() => {
    timers.onModuleDestroy();
    jest.useRealTimers();
  });

  it("runs the tournament's pass at the deadline, not before", async () => {
    timers.arm("tenant_a", "t1", Date.now() + 3_000);
    await jest.advanceTimersByTimeAsync(2_900);
    expect(run).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(200);
    expect(run).toHaveBeenCalledWith("t1");
    expect(timers.armedAt("t1")).toBeNull();
  });

  it("keeps the earliest deadline: an earlier one replaces it, a later one is ignored", async () => {
    const now = Date.now();
    expect(timers.arm("tenant_a", "t1", now + 5_000)).toBe(true);
    expect(timers.arm("tenant_a", "t1", now + 9_000)).toBe(false);
    expect(timers.arm("tenant_a", "t1", now + 1_000)).toBe(true);
    await jest.advanceTimersByTimeAsync(1_100);
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("leaves far deadlines to the cron pass", () => {
    expect(timers.arm("tenant_a", "t1", Date.now() + TOURNAMENT_TIMER_HORIZON_MS + 1)).toBe(false);
    expect(timers.armedAt("t1")).toBeNull();
  });

  it("arms from a deadline event raised inside an academy, and looks again after a state change", async () => {
    await runInTenant("tenant_a", "spec", async () => {
      events.deadlineAt("t1", Date.now() + 500);
      events.stateChanged("t2");
    });
    await jest.advanceTimersByTimeAsync(600);
    expect(run).toHaveBeenCalledWith("t1");
    expect(arm).toHaveBeenCalledWith("t2");
  });

  it("ignores events with no academy in context, and a failing run never throws", async () => {
    events.deadlineAt("t1", Date.now() + 100);
    expect(timers.armedAt("t1")).toBeNull();
    run.mockRejectedValueOnce(new Error("boom"));
    timers.arm("tenant_a", "t1", Date.now() + 100);
    await jest.advanceTimersByTimeAsync(200);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
