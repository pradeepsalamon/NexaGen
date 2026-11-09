import {
  ageOn,
  createTournamentRequestSchema,
  formatTimeControl,
  parseTournamentEligibility,
  resolveTournamentPhase,
  tournamentAgeGroup,
  tournamentConfigIssues,
  tournamentEligibilityIssue,
  tournamentEligibilitySchema,
  updateTournamentRequestSchema,
  type EligibilityFacts
} from "@nexa-chess/types";

// The shared tournament rules from @nexa-chess/types (docs/TOURNAMENTS.md
// Phase 2). The API enforces them; the web only displays them.

const facts = (over: Partial<EligibilityFacts> = {}): EligibilityFacts => ({
  age: 11,
  batchIds: ["b1"],
  experienceLevel: "INTERMEDIATE",
  rating: 1200,
  ...over
});

describe("ageOn / tournamentAgeGroup", () => {
  it("counts whole years at the cutoff date", () => {
    const dob = new Date("2015-06-15T00:00:00.000Z");
    expect(ageOn(dob, new Date("2025-06-14T00:00:00.000Z"))).toBe(9);
    expect(ageOn(dob, new Date("2025-06-15T00:00:00.000Z"))).toBe(10);
    expect(ageOn(dob, new Date("2026-01-01T00:00:00.000Z"))).toBe(10);
  });

  it.each([
    [5, "U8"],
    [7, "U8"],
    [8, "U10"],
    [11, "U12"],
    [17, "U18"],
    [18, "OPEN"],
    [40, "OPEN"],
    [null, null]
  ] as const)("age %p → %p", (age, group) => {
    expect(tournamentAgeGroup(age)).toBe(group);
  });
});

describe("tournamentEligibilityIssue", () => {
  it("no rules: everyone", () => {
    expect(tournamentEligibilityIssue({ allowUnrated: true }, facts({ rating: null }))).toBeNull();
  });

  it("age limit, and a missing date of birth", () => {
    const rules = { allowUnrated: true, maxAgeUnder: 12 };
    expect(tournamentEligibilityIssue(rules, facts({ age: 11 }))).toBeNull();
    expect(tournamentEligibilityIssue(rules, facts({ age: 12 }))).toMatch(/under 12/);
    expect(tournamentEligibilityIssue(rules, facts({ age: null }))).toMatch(/date of birth/);
    expect(tournamentEligibilityIssue({ allowUnrated: true, minAge: 10 }, facts({ age: 9 }))).toMatch(/10 and over/);
  });

  it("rating band, and unrated players", () => {
    const rules = { allowUnrated: false, maxRating: 1400, minRating: 1000 };
    expect(tournamentEligibilityIssue(rules, facts({ rating: 1000 }))).toBeNull();
    expect(tournamentEligibilityIssue(rules, facts({ rating: 1400 }))).toBeNull();
    expect(tournamentEligibilityIssue(rules, facts({ rating: 999 }))).toMatch(/at least 1000/);
    expect(tournamentEligibilityIssue(rules, facts({ rating: 1401 }))).toMatch(/up to 1400/);
    expect(tournamentEligibilityIssue(rules, facts({ rating: null }))).toMatch(/rated players only/);
    expect(tournamentEligibilityIssue({ ...rules, allowUnrated: true }, facts({ rating: null }))).toBeNull();
  });

  it("experience level and batches", () => {
    expect(tournamentEligibilityIssue({ allowUnrated: true, experienceLevels: ["BEGINNER"] }, facts())).toMatch(/experience level/);
    expect(tournamentEligibilityIssue({ allowUnrated: true, experienceLevels: ["INTERMEDIATE"] }, facts())).toBeNull();
    expect(tournamentEligibilityIssue({ allowUnrated: true, batchIds: ["b2"] }, facts())).toMatch(/particular batches/);
    expect(tournamentEligibilityIssue({ allowUnrated: true, batchIds: ["b2", "b1"] }, facts())).toBeNull();
  });

  it("the schema refuses contradictory bands; a bad stored value reads as no restriction", () => {
    expect(tournamentEligibilitySchema.safeParse({ maxRating: 1000, minRating: 1500 }).success).toBe(false);
    expect(tournamentEligibilitySchema.safeParse({ maxAgeUnder: 10, minAge: 10 }).success).toBe(false);
    expect(tournamentEligibilitySchema.safeParse({ unknown: 1 }).success).toBe(false);
    expect(parseTournamentEligibility({ maxRating: "lots" })).toEqual({ allowUnrated: true });
    expect(parseTournamentEligibility(null)).toEqual({ allowUnrated: true });
  });
});

describe("resolveTournamentPhase", () => {
  const base = {
    registrationClosesAt: null,
    registrationOpensAt: null,
    startsAt: "2026-12-01T10:00:00.000Z",
    status: "PUBLISHED" as const
  };
  const at = (iso: string) => new Date(iso);

  it("stored statuses pass through", () => {
    for (const status of ["DRAFT", "LIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const) {
      expect(resolveTournamentPhase({ ...base, status }, at("2026-11-01T00:00:00.000Z"))).toBe(status);
    }
  });

  it("a published tournament: upcoming → open → closed by the window", () => {
    const t = { ...base, registrationClosesAt: "2026-11-30T00:00:00.000Z", registrationOpensAt: "2026-11-10T00:00:00.000Z" };
    expect(resolveTournamentPhase(t, at("2026-11-09T23:59:59.000Z"))).toBe("UPCOMING");
    expect(resolveTournamentPhase(t, at("2026-11-10T00:00:00.000Z"))).toBe("REGISTRATION_OPEN");
    expect(resolveTournamentPhase(t, at("2026-11-30T00:00:00.000Z"))).toBe("REGISTRATION_CLOSED");
  });

  it("without a window: open from publication until the start", () => {
    expect(resolveTournamentPhase(base, at("2026-11-09T00:00:00.000Z"))).toBe("REGISTRATION_OPEN");
    expect(resolveTournamentPhase(base, at("2026-12-01T10:00:00.000Z"))).toBe("REGISTRATION_CLOSED");
  });
});

describe("tournament configuration", () => {
  const valid = {
    format: "SWISS" as const,
    name: "Autumn Swiss",
    rounds: 5,
    startsAt: "2026-12-01T10:00:00.000Z",
    timeControl: { incrementSeconds: 3, initialSeconds: 300 }
  };

  it("fills the create defaults", () => {
    expect(createTournamentRequestSchema.parse(valid)).toMatchObject({
      lateRegistrationRounds: 0,
      minPlayers: 2,
      registrationRequiresApproval: false,
      roundBreakSec: 60,
      visibility: "PUBLIC"
    });
  });

  it("an update never fills defaults (a missing field stays as stored)", () => {
    expect(updateTournamentRequestSchema.parse({ name: "Renamed", version: 3 })).toEqual({ name: "Renamed", version: 3 });
    expect(updateTournamentRequestSchema.safeParse({ name: "Renamed" }).success).toBe(false);
  });

  it.each([
    ["Swiss without rounds", { ...valid, rounds: undefined }, "rounds"],
    ["a triple round robin", { ...valid, format: "ROUND_ROBIN", rounds: 3 }, "rounds"],
    ["an arena without a duration", { ...valid, format: "ARENA", rounds: undefined }, "arenaDurationMin"],
    ["a cap below the minimum", { ...valid, maxPlayers: 4, minPlayers: 8 }, "maxPlayers"],
    ["registration closing after the start", { ...valid, registrationClosesAt: "2026-12-02T00:00:00.000Z" }, "registrationClosesAt"],
    [
      "registration closing before it opens",
      { ...valid, registrationClosesAt: "2026-11-20T00:00:00.000Z", registrationOpensAt: "2026-11-25T00:00:00.000Z" },
      "registrationClosesAt"
    ]
  ] as const)("refuses %s", (_label, value, path) => {
    expect(tournamentConfigIssues(value as Parameters<typeof tournamentConfigIssues>[0]).map((i) => i.path)).toContain(path);
    expect(createTournamentRequestSchema.safeParse(value).success).toBe(false);
  });

  it("accepts each format's minimum", () => {
    expect(createTournamentRequestSchema.safeParse(valid).success).toBe(true);
    expect(createTournamentRequestSchema.safeParse({ ...valid, format: "ARENA", arenaDurationMin: 60, rounds: undefined }).success).toBe(true);
    expect(createTournamentRequestSchema.safeParse({ ...valid, format: "ROUND_ROBIN", rounds: 2 }).success).toBe(true);
    expect(createTournamentRequestSchema.safeParse({ ...valid, format: "KNOCKOUT", rounds: undefined }).success).toBe(true);
  });

  it("refuses untimed and unknown fields", () => {
    expect(createTournamentRequestSchema.safeParse({ ...valid, timeControl: { incrementSeconds: 0, initialSeconds: 0 } }).success).toBe(false);
    expect(createTournamentRequestSchema.safeParse({ ...valid, tenantId: "x" }).success).toBe(false);
  });

  it("formats a time control", () => {
    expect(formatTimeControl({ incrementSeconds: 3, initialSeconds: 300 })).toBe("5 + 3");
    expect(formatTimeControl({ incrementSeconds: 0, initialSeconds: 30 })).toBe("30s + 0");
  });
});
