import {
  ACTIVITY_WRITE_WINDOW_MS,
  isNonActivityPath,
  shouldWriteLastActive
} from "./activity-throttle";

describe("shouldWriteLastActive", () => {
  it("writes on the first request (no prior write)", () => {
    expect(shouldWriteLastActive(undefined, 1_000)).toBe(true);
  });

  it("suppresses a second write inside the window", () => {
    const now = 1_000_000;
    expect(shouldWriteLastActive(now, now + ACTIVITY_WRITE_WINDOW_MS - 1)).toBe(
      false
    );
  });

  it("allows the write once the window has elapsed", () => {
    const now = 1_000_000;
    expect(shouldWriteLastActive(now, now + ACTIVITY_WRITE_WINDOW_MS)).toBe(true);
  });
});

describe("isNonActivityPath", () => {
  it.each(["/health", "/health/ready", "/stockfish/analyze", "/webhooks/livekit"])(
    "ignores %s",
    (path) => {
      expect(isNonActivityPath(path)).toBe(true);
    }
  );

  it.each(["/analytics/overview", "/auth/me", "/batches"])(
    "counts %s as activity",
    (path) => {
      expect(isNonActivityPath(path)).toBe(false);
    }
  );
});
