import {
  TOURNAMENT_FORMATS,
  TOURNAMENT_HOST_ROLES,
  TOURNAMENT_PLAYER_STATUSES,
  TOURNAMENT_PUBLIC_NAME_FORMATS,
  TOURNAMENT_RATING_SOURCES,
  TOURNAMENT_STATUSES,
  TOURNAMENT_TIEBREAKS,
  TOURNAMENT_VISIBILITIES,
  formatPublicPlayerName
} from "@nexa-chess/types";
import {
  TournamentFormat,
  TournamentHostRole,
  TournamentPlayerStatus,
  TournamentPublicNameFormat,
  TournamentRatingSource,
  TournamentStatus,
  TournamentTiebreak,
  TournamentVisibility
} from "@prisma/client";

// The shared contract mirrors the Prisma enums; a value added on one side only
// would reach a client it cannot parse, or a column it cannot store.
describe("tournament enums match the schema", () => {
  it.each([
    ["TournamentFormat", TOURNAMENT_FORMATS, TournamentFormat],
    ["TournamentStatus", TOURNAMENT_STATUSES, TournamentStatus],
    ["TournamentVisibility", TOURNAMENT_VISIBILITIES, TournamentVisibility],
    ["TournamentTiebreak", TOURNAMENT_TIEBREAKS, TournamentTiebreak],
    ["TournamentHostRole", TOURNAMENT_HOST_ROLES, TournamentHostRole],
    ["TournamentPlayerStatus", TOURNAMENT_PLAYER_STATUSES, TournamentPlayerStatus],
    ["TournamentRatingSource", TOURNAMENT_RATING_SOURCES, TournamentRatingSource],
    ["TournamentPublicNameFormat", TOURNAMENT_PUBLIC_NAME_FORMATS, TournamentPublicNameFormat]
  ] as const)("%s", (_name, shared, prisma) => {
    expect([...shared].sort()).toEqual(Object.values(prisma).sort());
  });
});

describe("formatPublicPlayerName", () => {
  it.each([
    ["Asha", "Rao", "FIRST_NAME_LAST_INITIAL", "Asha R."],
    ["Asha", "Rao", "FIRST_NAME_ONLY", "Asha"],
    ["Asha", "Rao", "INITIALS", "A. R."],
    ["  asha ", " rao", "FIRST_NAME_LAST_INITIAL", "asha R."],
    ["Asha", null, "FIRST_NAME_LAST_INITIAL", "Asha"],
    ["Asha", null, "INITIALS", "A."],
    ["", "", "FIRST_NAME_LAST_INITIAL", "Player"],
    ["", "", "FIRST_NAME_ONLY", "Player"],
    ["", "", "INITIALS", "Player"]
  ] as const)("%p %p %s → %p", (first, last, format, expected) => {
    expect(formatPublicPlayerName(first, last, format)).toBe(expected);
  });

  it("never contains the full last name", () => {
    for (const format of TOURNAMENT_PUBLIC_NAME_FORMATS) {
      expect(formatPublicPlayerName("Asha", "Raghunathan", format)).not.toContain("Raghunathan");
    }
  });
});
