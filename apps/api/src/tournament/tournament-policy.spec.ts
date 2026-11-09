import {
  Prisma,
  TournamentHostRole,
  TournamentPlayerStatus,
  TournamentStatus,
  TournamentVisibility,
  UserRole
} from "@prisma/client";
import {
  canBroadcast,
  canCreateTournament,
  canHoldHostRole,
  canManageTournament,
  canModerateTournament,
  canViewTournament,
  getTournamentVisibilityWhere,
  playerAcademyAllowed,
  tournamentPublishPath,
  type TournamentAccessFacts,
  type TournamentActor,
  type TournamentPolicySettings
} from "./tournament-policy";

const actor = (role: UserRole): TournamentActor => ({ id: `u-${role}`, role });
const ADMIN = actor(UserRole.ADMIN);
const SUPER = actor(UserRole.SUPER_ADMIN);
const COACH = actor(UserRole.COACH);
const STUDENT = actor(UserRole.STUDENT);

const facts = (over: Partial<TournamentAccessFacts> = {}): TournamentAccessFacts => ({
  hostRole: null,
  playerStatus: null,
  status: TournamentStatus.PUBLISHED,
  visibility: TournamentVisibility.PUBLIC,
  ...over
});

const settings = (over: Partial<TournamentPolicySettings> = {}): TournamentPolicySettings => ({
  allowAnonymousSpectating: false,
  coachesMayCreate: false,
  coachesMayPublishPublic: false,
  ...over
});

describe("tournament policy", () => {
  describe("canCreateTournament", () => {
    it("admins always; coaches only when the academy allows it; students never", () => {
      for (const a of [ADMIN, SUPER]) expect(canCreateTournament(a, settings())).toBe(true);
      expect(canCreateTournament(COACH, settings())).toBe(false);
      expect(canCreateTournament(COACH, settings({ coachesMayCreate: true }))).toBe(true);
      expect(canCreateTournament(STUDENT, settings({ coachesMayCreate: true }))).toBe(false);
    });
  });

  describe("canManageTournament", () => {
    it("admins without a host row", () => {
      expect(canManageTournament(ADMIN, facts())).toBe(true);
      expect(canManageTournament(SUPER, facts())).toBe(true);
    });

    it("a coach only as HOST or CO_HOST of that tournament", () => {
      expect(canManageTournament(COACH, facts())).toBe(false);
      expect(canManageTournament(COACH, facts({ hostRole: TournamentHostRole.HOST }))).toBe(true);
      expect(canManageTournament(COACH, facts({ hostRole: TournamentHostRole.CO_HOST }))).toBe(true);
      expect(canManageTournament(COACH, facts({ hostRole: TournamentHostRole.COMMENTATOR }))).toBe(false);
    });

    it("a host row on a student account counts for nothing", () => {
      expect(canManageTournament(STUDENT, facts({ hostRole: TournamentHostRole.HOST }))).toBe(false);
      expect(canBroadcast(STUDENT, facts({ hostRole: TournamentHostRole.HOST }))).toBe(false);
      expect(canModerateTournament(STUDENT, facts({ hostRole: TournamentHostRole.HOST }))).toBe(false);
    });

    it("never anonymous", () => {
      expect(canManageTournament(null, facts())).toBe(false);
    });
  });

  describe("tournamentPublishPath", () => {
    it("admins publish directly, whatever the visibility", () => {
      for (const visibility of Object.values(TournamentVisibility)) {
        expect(tournamentPublishPath(ADMIN, facts({ visibility }), settings())).toBe("DIRECT");
      }
    });

    it("the coach HOST publishes PRIVATE and INVITATION_ONLY directly", () => {
      for (const visibility of [TournamentVisibility.PRIVATE, TournamentVisibility.INVITATION_ONLY]) {
        expect(tournamentPublishPath(COACH, facts({ hostRole: TournamentHostRole.HOST, visibility }), settings())).toBe(
          "DIRECT"
        );
      }
    });

    it("a PUBLIC tournament needs an approval unless the academy lets coaches publish public ones", () => {
      const host = facts({ hostRole: TournamentHostRole.HOST, visibility: TournamentVisibility.PUBLIC });
      expect(tournamentPublishPath(COACH, host, settings())).toBe("APPROVAL");
      expect(tournamentPublishPath(COACH, host, settings({ coachesMayPublishPublic: true }))).toBe("DIRECT");
    });

    it("CO_HOSTs, commentators, other coaches and students cannot publish", () => {
      for (const hostRole of [TournamentHostRole.CO_HOST, TournamentHostRole.COMMENTATOR, null]) {
        expect(tournamentPublishPath(COACH, facts({ hostRole }), settings({ coachesMayPublishPublic: true }))).toBe(
          "FORBIDDEN"
        );
      }
      expect(tournamentPublishPath(STUDENT, facts({ hostRole: TournamentHostRole.HOST }), settings())).toBe("FORBIDDEN");
    });
  });

  describe("canBroadcast / canModerateTournament", () => {
    it("every host role broadcasts; only the HOST (and admins) moderate", () => {
      for (const hostRole of Object.values(TournamentHostRole)) {
        expect(canBroadcast(COACH, facts({ hostRole }))).toBe(true);
        expect(canModerateTournament(COACH, facts({ hostRole }))).toBe(hostRole === TournamentHostRole.HOST);
      }
      expect(canBroadcast(COACH, facts())).toBe(false);
      expect(canBroadcast(ADMIN, facts())).toBe(true);
      expect(canModerateTournament(ADMIN, facts())).toBe(true);
      expect(canBroadcast(null, facts())).toBe(false);
    });
  });

  describe("canViewTournament", () => {
    it("a draft is only for admins and its hosts", () => {
      const draft = facts({ status: TournamentStatus.DRAFT });
      expect(canViewTournament(ADMIN, draft, settings())).toBe(true);
      expect(canViewTournament(COACH, { ...draft, hostRole: TournamentHostRole.COMMENTATOR }, settings())).toBe(true);
      expect(canViewTournament(COACH, draft, settings())).toBe(false);
      expect(canViewTournament(STUDENT, { ...draft, playerStatus: TournamentPlayerStatus.INVITED }, settings())).toBe(
        false
      );
      expect(canViewTournament(null, draft, settings({ allowAnonymousSpectating: true }))).toBe(false);
    });

    it("PUBLIC: every signed-in member; anonymous only when the academy allows it", () => {
      expect(canViewTournament(STUDENT, facts(), settings())).toBe(true);
      expect(canViewTournament(COACH, facts(), settings())).toBe(true);
      expect(canViewTournament(null, facts(), settings())).toBe(false);
      expect(canViewTournament(null, facts(), settings({ allowAnonymousSpectating: true }))).toBe(true);
    });

    it("PRIVATE / INVITATION_ONLY: players, invitees, hosts and admins, never anonymous", () => {
      for (const visibility of [TournamentVisibility.PRIVATE, TournamentVisibility.INVITATION_ONLY]) {
        const anon = settings({ allowAnonymousSpectating: true });
        expect(canViewTournament(null, facts({ visibility }), anon)).toBe(false);
        expect(canViewTournament(STUDENT, facts({ visibility }), anon)).toBe(false);
        expect(canViewTournament(COACH, facts({ visibility }), anon)).toBe(false);
        expect(canViewTournament(ADMIN, facts({ visibility }), anon)).toBe(true);
        expect(
          canViewTournament(STUDENT, facts({ playerStatus: TournamentPlayerStatus.INVITED, visibility }), anon)
        ).toBe(true);
        expect(
          canViewTournament(STUDENT, facts({ playerStatus: TournamentPlayerStatus.WITHDRAWN, visibility }), anon)
        ).toBe(true);
        expect(
          canViewTournament(STUDENT, facts({ playerStatus: TournamentPlayerStatus.REJECTED, visibility }), anon)
        ).toBe(false);
      }
    });
  });

  describe("getTournamentVisibilityWhere matches canViewTournament", () => {
    // A tiny evaluator for exactly the shapes getTournamentVisibilityWhere builds.
    type Row = TournamentAccessFacts & { viewerId: string };
    const matches = (where: Prisma.TournamentWhereInput, row: Row): boolean => {
      if (where.OR) return (where.OR as Prisma.TournamentWhereInput[]).some((w) => matches(w, row));
      if (where.visibility !== undefined && where.visibility !== row.visibility) return false;
      const status = where.status as { not?: TournamentStatus } | undefined;
      if (status?.not !== undefined && row.status === status.not) return false;
      const players = where.players as { some: { status: { in: TournamentPlayerStatus[] }; userId: string } } | undefined;
      if (players) {
        const p = players.some;
        if (!(p.userId === row.viewerId && row.playerStatus !== null && p.status.in.includes(row.playerStatus))) {
          return false;
        }
      }
      const hosts = where.hosts as { some: { userId: string } } | undefined;
      if (hosts && !(hosts.some.userId === row.viewerId && row.hostRole !== null)) return false;
      return true;
    };

    const viewers: (TournamentActor | null)[] = [ADMIN, SUPER, COACH, STUDENT, null];
    const cases: TournamentAccessFacts[] = [];
    for (const status of Object.values(TournamentStatus))
      for (const visibility of Object.values(TournamentVisibility))
        for (const hostRole of [null, ...Object.values(TournamentHostRole)])
          for (const playerStatus of [null, ...Object.values(TournamentPlayerStatus)])
            cases.push({ hostRole, playerStatus, status, visibility });

    it.each(viewers.map((v) => [v?.role ?? "anonymous", v] as const))("for %s", (_label, viewer) => {
      const where = getTournamentVisibilityWhere(viewer);
      // The list filter is the anonymous-allowed view; the caller gates anonymous on the setting.
      const anon = settings({ allowAnonymousSpectating: true });
      for (const c of cases) {
        const row = { ...c, viewerId: viewer?.id ?? "nobody" };
        // Facts as seen by this viewer: an anonymous viewer has no host or player row.
        const seen = viewer ? c : { ...c, hostRole: null, playerStatus: null };
        expect({ c, listed: matches(where, row) }).toEqual({ c, listed: canViewTournament(viewer, seen, anon) });
      }
    });
  });

  it("only staff accounts hold host rows", () => {
    expect(canHoldHostRole(UserRole.ADMIN)).toBe(true);
    expect(canHoldHostRole(UserRole.SUPER_ADMIN)).toBe(true);
    expect(canHoldHostRole(UserRole.COACH)).toBe(true);
    expect(canHoldHostRole(UserRole.STUDENT)).toBe(false);
    expect(canHoldHostRole(UserRole.SALES)).toBe(false);
  });

  it("v1 keeps players in the organizing academy", () => {
    expect(playerAcademyAllowed("tenant_a", "tenant_a")).toBe(true);
    expect(playerAcademyAllowed("tenant_a", "tenant_b")).toBe(false);
  });
});
