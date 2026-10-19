import {
  generateOccurrences,
  instantsOverlap,
  RecurrenceValidationError,
  validateRules,
  zonedWallTimeToUtc
} from "./recurrence.util";

const MON = 1;
const WED = 3;
const SAT = 6;

describe("recurrence engine", () => {
  describe("generateOccurrences — weekday expansion", () => {
    it("expands a Mon/Wed schedule across September 2026 (inclusive)", () => {
      const occ = generateOccurrences({
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        timezone: "Asia/Kolkata",
        rules: [
          { id: "mon", dayOfWeek: MON, startTime: "18:00", endTime: "19:00", coachId: "c1" },
          { id: "wed", dayOfWeek: WED, startTime: "18:00", endTime: "19:00", coachId: "c1" }
        ]
      });

      // Mondays: 7,14,21,28 (4). Wednesdays: 2,9,16,23,30 (5). Total 9.
      expect(occ).toHaveLength(9);
      expect(occ[0].date).toBe("2026-09-02");
      expect(occ[occ.length - 1].date).toBe("2026-09-30");
      // strictly increasing start instants
      for (let i = 1; i < occ.length; i += 1) {
        expect(occ[i].startsAt.getTime()).toBeGreaterThan(occ[i - 1].startsAt.getTime());
      }
    });

    it("handles three weekly rules with different coaches and durations", () => {
      const occ = generateOccurrences({
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        timezone: "Asia/Kolkata",
        rules: [
          { id: "mon", dayOfWeek: MON, startTime: "18:00", endTime: "19:00", coachId: "john" },
          { id: "wed", dayOfWeek: WED, startTime: "18:00", endTime: "19:00", coachId: "john" },
          { id: "sat", dayOfWeek: SAT, startTime: "10:00", endTime: "11:30", coachId: "david" }
        ]
      });

      // + Saturdays 5,12,19,26 (4) → 9 + 4 = 13
      expect(occ).toHaveLength(13);
      const saturdays = occ.filter((o) => o.dayOfWeek === SAT);
      expect(saturdays).toHaveLength(4);
      expect(saturdays.every((o) => o.coachId === "david")).toBe(true);
      const durationMin =
        (saturdays[0].endsAt.getTime() - saturdays[0].startsAt.getTime()) / 60000;
      expect(durationMin).toBe(90);
    });

    it("is end-date inclusive", () => {
      // 2026-09-30 is a Wednesday
      const occ = generateOccurrences({
        startDate: "2026-09-30",
        endDate: "2026-09-30",
        timezone: "UTC",
        rules: [{ id: "wed", dayOfWeek: WED, startTime: "09:00", endTime: "10:00", coachId: "c1" }]
      });
      expect(occ).toHaveLength(1);
      expect(occ[0].date).toBe("2026-09-30");
    });

    it("skips exception dates without breaking the rule", () => {
      const base = {
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        timezone: "Asia/Kolkata",
        rules: [
          { id: "sat", dayOfWeek: SAT, startTime: "10:00", endTime: "11:30", coachId: "c1" }
        ]
      };
      const withException = generateOccurrences({
        ...base,
        exceptions: ["2026-09-12"]
      });
      expect(withException).toHaveLength(3);
      expect(withException.map((o) => o.date)).not.toContain("2026-09-12");
    });

    it("produces no duplicates when regenerated with identical input", () => {
      const input = {
        startDate: "2026-09-01",
        endDate: "2026-12-31",
        timezone: "Asia/Kolkata",
        rules: [
          { id: "mon", dayOfWeek: MON, startTime: "18:00", endTime: "19:00", coachId: "c1" },
          { id: "wed", dayOfWeek: WED, startTime: "18:00", endTime: "19:00", coachId: "c1" }
        ]
      };
      const a = generateOccurrences(input);
      const b = generateOccurrences(input);
      expect(a.map((o) => `${o.date}|${o.ruleId}`)).toEqual(
        b.map((o) => `${o.date}|${o.ruleId}`)
      );
      const keys = new Set(a.map((o) => `${o.date}|${o.ruleId}`));
      expect(keys.size).toBe(a.length);
    });
  });

  describe("timezone + DST", () => {
    it("converts Asia/Kolkata wall time to the correct UTC instant (UTC+5:30)", () => {
      const d = zonedWallTimeToUtc(2026, 9, 7, 18, 0, "Asia/Kolkata");
      expect(d.toISOString()).toBe("2026-09-07T12:30:00.000Z");
    });

    it("keeps a fixed local wall time across a US DST spring-forward", () => {
      // 2026 US DST starts 2026-03-08. A 09:00 New York class:
      const before = zonedWallTimeToUtc(2026, 3, 2, 9, 0, "America/New_York"); // EST -5
      const after = zonedWallTimeToUtc(2026, 3, 9, 9, 0, "America/New_York"); // EDT -4
      expect(before.toISOString()).toBe("2026-03-02T14:00:00.000Z");
      expect(after.toISOString()).toBe("2026-03-09T13:00:00.000Z");
    });

    it("generates DST-correct occurrences for a New York Monday class", () => {
      const occ = generateOccurrences({
        startDate: "2026-03-02",
        endDate: "2026-03-16",
        timezone: "America/New_York",
        rules: [{ id: "mon", dayOfWeek: MON, startTime: "09:00", endTime: "10:00", coachId: "c1" }]
      });
      expect(occ.map((o) => o.startsAt.toISOString())).toEqual([
        "2026-03-02T14:00:00.000Z",
        "2026-03-09T13:00:00.000Z",
        "2026-03-16T13:00:00.000Z"
      ]);
    });
  });

  describe("validation", () => {
    it("rejects an empty rule set", () => {
      expect(() => validateRules([])).toThrow(RecurrenceValidationError);
    });

    it("rejects end <= start within a rule", () => {
      expect(() =>
        validateRules([
          { id: "x", dayOfWeek: MON, startTime: "19:00", endTime: "18:00", coachId: "c1" }
        ])
      ).toThrow(/after start time/);
    });

    it("rejects two overlapping enabled rules on the same day", () => {
      expect(() =>
        validateRules([
          { id: "a", dayOfWeek: MON, startTime: "18:00", endTime: "19:30", coachId: "c1" },
          { id: "b", dayOfWeek: MON, startTime: "19:00", endTime: "20:00", coachId: "c2" }
        ])
      ).toThrow(/overlap/);
    });

    it("allows back-to-back rules on the same day", () => {
      expect(() =>
        validateRules([
          { id: "a", dayOfWeek: MON, startTime: "18:00", endTime: "19:00", coachId: "c1" },
          { id: "b", dayOfWeek: MON, startTime: "19:00", endTime: "20:00", coachId: "c2" }
        ])
      ).not.toThrow();
    });

    it("rejects an end date before the start date", () => {
      expect(() =>
        generateOccurrences({
          startDate: "2026-09-30",
          endDate: "2026-09-01",
          timezone: "UTC",
          rules: [{ id: "a", dayOfWeek: MON, startTime: "18:00", endTime: "19:00", coachId: "c1" }]
        })
      ).toThrow(RecurrenceValidationError);
    });

    it("rejects a range exceeding 2 years", () => {
      expect(() =>
        generateOccurrences({
          startDate: "2026-01-01",
          endDate: "2029-01-01",
          timezone: "UTC",
          rules: [{ id: "a", dayOfWeek: MON, startTime: "18:00", endTime: "19:00", coachId: "c1" }]
        })
      ).toThrow("Schedule range cannot exceed 2 years.");
    });

    it("rejects invalid calendar dates like Feb 30", () => {
      expect(() =>
        generateOccurrences({
          startDate: "2026-02-30",
          endDate: "2026-03-15",
          timezone: "UTC",
          rules: [{ id: "a", dayOfWeek: MON, startTime: "18:00", endTime: "19:00", coachId: "c1" }]
        })
      ).toThrow(RecurrenceValidationError);
    });
  });

  describe("instantsOverlap", () => {
    it("detects overlap and abutment correctly", () => {
      const a1 = new Date("2026-09-07T18:00:00Z");
      const a2 = new Date("2026-09-07T19:00:00Z");
      expect(instantsOverlap(a1, a2, new Date("2026-09-07T18:30:00Z"), new Date("2026-09-07T19:30:00Z"))).toBe(true);
      expect(instantsOverlap(a1, a2, a2, new Date("2026-09-07T20:00:00Z"))).toBe(false);
    });
  });
});
