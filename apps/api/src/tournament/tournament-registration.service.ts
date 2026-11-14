import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ageOn,
  parseTournamentEligibility,
  resolveTournamentPhase,
  tournamentAgeGroup,
  tournamentEligibilityIssue,
  type AddTournamentPlayersRequest,
  type AddTournamentPlayersResponse,
  type DecideTournamentPlayerRequest,
  type TournamentCandidatesResponse,
  type TournamentPlayerResponse,
  type TournamentPlayersResponse
} from "@nexa-chess/types";
import {
  BatchStatus,
  Prisma,
  TournamentAuditAction,
  TournamentPlayerStatus,
  TournamentRatingSource,
  TournamentStatus,
  TournamentVisibility,
  UserRole,
  UserStatus,
  type Tournament
} from "@prisma/client";
import { isAdminRole } from "../auth/authenticate";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { TournamentAccessService, type LoadedTournament, type TournamentViewer } from "./tournament-access.service";
import { TournamentAuditService } from "./tournament-audit.service";
import { TournamentNotifierService } from "./tournament-notifier.service";
import { playerInclude, personSelect, toPerson, toPlayer } from "./tournament-mapper";
import { canManageTournament, playerAcademyAllowed } from "./tournament-policy";

type Tx = PrismaTransactionClient;

/** Statuses that hold a place against `maxPlayers`. */
const HOLDS_PLACE: TournamentPlayerStatus[] = [TournamentPlayerStatus.PENDING, TournamentPlayerStatus.APPROVED];
/** A player in one of these may withdraw while registration is still possible. */
const WITHDRAWABLE: TournamentPlayerStatus[] = [
  TournamentPlayerStatus.INVITED,
  TournamentPlayerStatus.PENDING,
  TournamentPlayerStatus.APPROVED
];
/** A previous entry in one of these may enter again. */
const REENTERABLE: TournamentPlayerStatus[] = [TournamentPlayerStatus.WITHDRAWN];

type Candidate = {
  id: string;
  firstName: string;
  lastName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  tenantId: string;
  studentProfile: { dateOfBirth: Date | null; chessRating: number | null; experienceLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" } | null;
  studentBatches: { batchId: string }[];
};

const candidateSelect = {
  ...personSelect,
  role: true,
  status: true,
  studentBatches: { select: { batchId: true }, where: { batch: { isDeleted: false, status: { not: BatchStatus.ARCHIVED } }, isDeleted: false } },
  studentProfile: { select: { chessRating: true, dateOfBirth: true, experienceLevel: true } },
  tenantId: true
} satisfies Prisma.UserSelect;

/**
 * Registration (docs/TOURNAMENTS.md Phase 2): the `RegistrationGate` chain —
 * window → role → academy → eligibility → capacity → approval — applied to
 * self-registration, host/admin entries and accepted invitations alike.
 * Capacity is checked under a row lock on the tournament, so two last-place
 * registrations can't both succeed; a second entry for the same player hits
 * the unique key.
 */
@Injectable()
export class TournamentRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TournamentAccessService,
    private readonly audit: TournamentAuditService,
    private readonly notifier: TournamentNotifierService
  ) {}

  // ── the viewer's own entry ──

  /** Null when the viewer could register right now; else the reason (for the button). */
  async selfRegistrationIssue(user: TournamentViewer, loaded: LoadedTournament): Promise<string | null> {
    const { tournament, playerRow } = loaded;
    if (playerRow && !REENTERABLE.includes(playerRow.status)) {
      return playerRow.status === TournamentPlayerStatus.INVITED ? "Accept your invitation to enter." : "You're already entered.";
    }
    const gate = this.windowIssue(tournament) ?? this.selfAllowedIssue(tournament);
    if (gate) return gate;
    if (user.role !== UserRole.STUDENT) return "Only students can enter tournaments.";
    const candidate = await this.prisma.user.findUnique({ select: candidateSelect, where: { id: user.id } });
    return candidate ? this.eligibilityIssue(tournament, candidate) : "Only students can enter tournaments.";
  }

  canWithdraw(loaded: LoadedTournament): boolean {
    return (
      !!loaded.playerRow &&
      WITHDRAWABLE.includes(loaded.playerRow.status) &&
      loaded.tournament.status === TournamentStatus.PUBLISHED
    );
  }

  async register(accessToken: string | undefined, id: string): Promise<TournamentPlayerResponse> {
    const user = await this.access.authenticate(accessToken);
    const loaded = await this.access.load(user, id);
    const issue = this.selfAllowedIssue(loaded.tournament);
    if (issue) throw new ForbiddenException(issue);
    const player = await this.prisma.$transaction(async (tx) => {
      const tournament = await this.lock(tx, id);
      const locked = this.selfAllowedIssue(tournament);
      if (locked) throw new ConflictException(locked);
      return this.enter(tx, tournament, user.id, {
        registeredById: user.id,
        status: tournament.registrationRequiresApproval ? TournamentPlayerStatus.PENDING : TournamentPlayerStatus.APPROVED
      });
    });
    this.notifier.registeredInBackground(player.id);
    return { player: toPlayer(player) };
  }

  async withdraw(accessToken: string | undefined, id: string): Promise<TournamentPlayerResponse> {
    const user = await this.access.authenticate(accessToken);
    const loaded = await this.access.load(user, id);
    if (!loaded.playerRow) throw new NotFoundException("You're not entered in this tournament.");
    if (!this.canWithdraw(loaded)) {
      throw new ConflictException("You can't withdraw now. Ask the tournament's host.");
    }
    const { count } = await this.prisma.tournamentPlayer.updateMany({
      data: { status: TournamentPlayerStatus.WITHDRAWN, withdrawnAt: new Date() },
      where: { id: loaded.playerRow.id, status: { in: WITHDRAWABLE } }
    });
    if (count === 0) throw new ConflictException("Your entry changed. Reload and try again.");
    return { player: toPlayer(await this.prisma.tournamentPlayer.findUniqueOrThrow({ include: playerInclude, where: { id: loaded.playerRow.id } })) };
  }

  async acceptInvitation(accessToken: string | undefined, id: string): Promise<TournamentPlayerResponse> {
    const user = await this.access.authenticate(accessToken);
    const loaded = await this.access.load(user, id);
    if (loaded.playerRow?.status !== TournamentPlayerStatus.INVITED) throw new NotFoundException("There is no invitation to accept.");
    const windowIssue = this.windowIssue(loaded.tournament);
    if (windowIssue) throw new ConflictException(windowIssue);
    const player = await this.prisma.$transaction(async (tx) => {
      const tournament = await this.lock(tx, id);
      const locked = this.windowIssue(tournament);
      if (locked) throw new ConflictException(locked);
      return this.enter(tx, tournament, user.id, {
        expect: TournamentPlayerStatus.INVITED,
        registeredById: loaded.playerRow!.registeredById,
        status: tournament.registrationRequiresApproval ? TournamentPlayerStatus.PENDING : TournamentPlayerStatus.APPROVED
      });
    });
    this.notifier.registeredInBackground(player.id);
    return { player: toPlayer(player) };
  }

  async declineInvitation(accessToken: string | undefined, id: string): Promise<TournamentPlayerResponse> {
    const user = await this.access.authenticate(accessToken);
    const loaded = await this.access.load(user, id);
    if (loaded.playerRow?.status !== TournamentPlayerStatus.INVITED) throw new NotFoundException("There is no invitation to decline.");
    const { count } = await this.prisma.tournamentPlayer.updateMany({
      data: { status: TournamentPlayerStatus.WITHDRAWN, withdrawnAt: new Date() },
      where: { id: loaded.playerRow.id, status: TournamentPlayerStatus.INVITED }
    });
    if (count === 0) throw new ConflictException("Your invitation changed. Reload and try again.");
    return { player: toPlayer(await this.prisma.tournamentPlayer.findUniqueOrThrow({ include: playerInclude, where: { id: loaded.playerRow.id } })) };
  }

  // ── managers ──

  async listPlayers(accessToken: string | undefined, id: string): Promise<TournamentPlayersResponse> {
    const user = await this.access.authenticate(accessToken);
    const loaded = await this.access.load(user, id);
    const manager = canManageTournament(this.access.actor(user), loaded.facts);
    const rows = await this.prisma.tournamentPlayer.findMany({
      include: playerInclude,
      orderBy: [{ seedNumber: "asc" }, { seedRating: { nulls: "last", sort: "desc" } }, { createdAt: "asc" }],
      // Everyone sees who is playing; managers also see pending, invited, rejected and withdrawn entries.
      where: { tournamentId: id, ...(manager ? {} : { status: { in: [TournamentPlayerStatus.APPROVED, TournamentPlayerStatus.DISQUALIFIED] } }) }
    });
    return { players: rows.map(toPlayer) };
  }

  /** Students a manager may enter: a coach host reaches own-batch students only; admins any student. */
  async candidates(accessToken: string | undefined, id: string, search: string | undefined): Promise<TournamentCandidatesResponse> {
    const user = await this.access.authenticate(accessToken);
    const { tournament } = await this.access.loadForManager(user, id);
    const term = search?.trim();
    const rows = await this.prisma.user.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { ...candidateSelect, tournamentEntries: { select: { status: true }, where: { tournamentId: id } } },
      take: 50,
      where: {
        AND: [
          this.reachWhere(user),
          { role: UserRole.STUDENT, status: UserStatus.ACTIVE },
          term
            ? { OR: [{ firstName: { contains: term, mode: "insensitive" } }, { lastName: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }] }
            : {}
        ]
      }
    });
    return {
      candidates: rows.map((row) => ({
        ...toPerson(row),
        entered: row.tournamentEntries[0]?.status ?? null,
        issue: this.eligibilityIssue(tournament, row),
        rating: row.studentProfile?.chessRating ?? null
      }))
    };
  }

  async addPlayers(accessToken: string | undefined, id: string, dto: AddTournamentPlayersRequest): Promise<AddTournamentPlayersResponse> {
    const user = await this.access.authenticate(accessToken);
    const { tournament: loaded } = await this.access.loadForManager(user, id);
    if (loaded.status !== TournamentStatus.DRAFT && loaded.status !== TournamentStatus.PUBLISHED) {
      throw new ConflictException("Players can only be added before the tournament starts.");
    }
    const as = dto.as ?? "APPROVED";
    // Load before link: only students this manager may reach, in this academy.
    const reachable = await this.prisma.user.findMany({
      select: { id: true },
      where: { AND: [this.reachWhere(user), { id: { in: dto.userIds }, role: UserRole.STUDENT, status: UserStatus.ACTIVE }] }
    });
    const reachableIds = new Set(reachable.map((r) => r.id));
    const added: AddTournamentPlayersResponse["added"] = [];
    const skipped: AddTournamentPlayersResponse["skipped"] = [];
    for (const userId of [...new Set(dto.userIds)]) {
      if (!reachableIds.has(userId)) {
        skipped.push({ reason: isAdminRole(user.role) ? "Not an active student of this academy." : "Not a student of your batches.", userId });
        continue;
      }
      try {
        const row = await this.prisma.$transaction(async (tx) => {
          const tournament = await this.lock(tx, id);
          if (tournament.status !== TournamentStatus.DRAFT && tournament.status !== TournamentStatus.PUBLISHED) {
            throw new ConflictException("Players can only be added before the tournament starts.");
          }
          const player = await this.enter(tx, tournament, userId, {
            countsAgainstCapacity: as === "APPROVED",
            registeredById: user.id,
            status: as === "INVITED" ? TournamentPlayerStatus.INVITED : TournamentPlayerStatus.APPROVED
          });
          await this.audit.record(tx, {
            action: as === "INVITED" ? TournamentAuditAction.PLAYER_INVITED : TournamentAuditAction.PLAYER_ADDED,
            actorId: user.id,
            targetId: player.id,
            targetType: "TournamentPlayer",
            tournamentId: id
          });
          return player;
        });
        added.push(toPlayer(row));
        if (as === "INVITED") this.notifier.invitedInBackground(row.id);
        else this.notifier.registeredInBackground(row.id);
      } catch (error) {
        if (error instanceof ConflictException || error instanceof ForbiddenException || error instanceof BadRequestException) {
          skipped.push({ reason: error.message, userId });
          continue;
        }
        throw error;
      }
    }
    return { added, skipped };
  }

  async decide(
    accessToken: string | undefined,
    id: string,
    playerId: string,
    dto: DecideTournamentPlayerRequest
  ): Promise<TournamentPlayerResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForManager(user, id);
    const player = await this.prisma.$transaction(async (tx) => {
      const tournament = await this.lock(tx, id);
      if (tournament.status !== TournamentStatus.DRAFT && tournament.status !== TournamentStatus.PUBLISHED) {
        throw new ConflictException("The tournament has started: withdraw or disqualify the player from the running tournament instead.");
      }
      const row = await tx.tournamentPlayer.findFirst({ where: { id: playerId, tournamentId: id } });
      if (!row) throw new NotFoundException("Player not found.");
      const from: TournamentPlayerStatus[] =
        dto.status === "APPROVED"
          ? [TournamentPlayerStatus.PENDING]
          : dto.status === "REJECTED"
            ? [TournamentPlayerStatus.PENDING, TournamentPlayerStatus.INVITED]
            : [TournamentPlayerStatus.APPROVED];
      if (!from.includes(row.status)) throw new ConflictException(`A ${row.status.toLowerCase()} entry can't be ${dto.status.toLowerCase()}.`);
      if (dto.status === "APPROVED" && tournament.maxPlayers !== null) {
        const approved = await tx.tournamentPlayer.count({ where: { status: TournamentPlayerStatus.APPROVED, tournamentId: id } });
        if (approved >= tournament.maxPlayers) throw new ConflictException("The tournament is full.");
      }
      const { count } = await tx.tournamentPlayer.updateMany({
        data: { decidedAt: new Date(), decidedById: user.id, status: dto.status },
        where: { id: playerId, status: row.status }
      });
      if (count === 0) throw new ConflictException("This entry changed. Reload and try again.");
      await this.audit.record(tx, {
        action:
          dto.status === "APPROVED"
            ? TournamentAuditAction.PLAYER_APPROVED
            : dto.status === "REJECTED"
              ? TournamentAuditAction.PLAYER_REJECTED
              : TournamentAuditAction.PLAYER_DISQUALIFIED,
        actorId: user.id,
        before: { status: row.status },
        reason: dto.reason,
        targetId: playerId,
        targetType: "TournamentPlayer",
        tournamentId: id
      });
      return tx.tournamentPlayer.findUniqueOrThrow({ include: playerInclude, where: { id: playerId } });
    });
    if (dto.status === "APPROVED") this.notifier.registeredInBackground(player.id);
    return { player: toPlayer(player) };
  }

  // ── the gate ──

  /**
   * Enters (or re-enters) one player inside the caller's transaction, after
   * `lock()`: academy, eligibility and capacity are checked against the locked
   * row, and the seed rating and age group are snapshotted.
   */
  private async enter(
    tx: Tx,
    tournament: Tournament,
    userId: string,
    options: {
      status: TournamentPlayerStatus;
      registeredById: string | null;
      /** Only from this existing status (accepting an invitation). */
      expect?: TournamentPlayerStatus;
      countsAgainstCapacity?: boolean;
    }
  ) {
    const candidate = await tx.user.findUnique({ select: candidateSelect, where: { id: userId } });
    if (!candidate || candidate.role !== UserRole.STUDENT || candidate.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException("Only active students can enter tournaments.");
    }
    if (!playerAcademyAllowed(tournament.tenantId, candidate.tenantId)) {
      throw new ForbiddenException("This tournament is for players of the organizing academy.");
    }
    const issue = this.eligibilityIssue(tournament, candidate);
    if (issue && options.status !== TournamentPlayerStatus.INVITED) throw new ForbiddenException(issue);

    const existing = await tx.tournamentPlayer.findUnique({ where: { tournamentId_userId: { tournamentId: tournament.id, userId } } });
    if (options.expect && existing?.status !== options.expect) throw new ConflictException("This entry changed. Reload and try again.");
    if (existing && !options.expect && !REENTERABLE.includes(existing.status)) {
      throw new ConflictException(
        existing.status === TournamentPlayerStatus.REJECTED || existing.status === TournamentPlayerStatus.DISQUALIFIED
          ? "This player can't enter this tournament again."
          : "Already entered."
      );
    }
    if ((options.countsAgainstCapacity ?? true) && options.status !== TournamentPlayerStatus.INVITED && tournament.maxPlayers !== null) {
      const taken = await tx.tournamentPlayer.count({ where: { status: { in: HOLDS_PLACE }, tournamentId: tournament.id } });
      if (taken >= tournament.maxPlayers) throw new ConflictException("The tournament is full.");
    }

    const rating = candidate.studentProfile?.chessRating ?? null;
    const age = this.ageOf(tournament, candidate);
    const data = {
      ageGroup: tournamentAgeGroup(age),
      decidedAt: options.status === TournamentPlayerStatus.APPROVED ? new Date() : null,
      registeredById: options.registeredById,
      seedRating: rating,
      seedRatingSource: rating === null ? TournamentRatingSource.UNRATED : TournamentRatingSource.PROFILE,
      status: options.status,
      withdrawnAt: null
    };
    try {
      return existing
        ? await tx.tournamentPlayer.update({ data, include: playerInclude, where: { id: existing.id } })
        : await tx.tournamentPlayer.create({ data: { ...data, tournamentId: tournament.id, userId }, include: playerInclude });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Already entered.");
      throw error;
    }
  }

  /** Serializes registrations of one tournament (capacity) and re-reads it. */
  private async lock(tx: Tx, id: string): Promise<Tournament> {
    await tx.$queryRaw`SELECT "id" FROM "tournaments" WHERE "id" = ${id} FOR UPDATE`;
    const tournament = await tx.tournament.findUnique({ where: { id } });
    if (!tournament) throw new NotFoundException("Tournament not found.");
    return tournament;
  }

  /** Whether entries are possible at all right now (manager entries also work in DRAFT). */
  private windowIssue(tournament: Tournament): string | null {
    const phase = resolveTournamentPhase(tournament);
    switch (phase) {
      case "REGISTRATION_OPEN":
        return null;
      case "DRAFT":
        return "The tournament isn't published yet.";
      case "UPCOMING":
        return "Registration hasn't opened yet.";
      case "REGISTRATION_CLOSED":
        return "Registration has closed.";
      case "LIVE":
      case "PAUSED":
        return "The tournament has started.";
      case "COMPLETED":
        return "The tournament is over.";
      case "CANCELLED":
        return "The tournament was cancelled.";
    }
  }

  /** Self-registration needs an open window and a PUBLIC tournament. */
  private selfAllowedIssue(tournament: Tournament): string | null {
    const window = this.windowIssue(tournament);
    if (window) return window;
    if (tournament.visibility === TournamentVisibility.INVITATION_ONLY) return "This tournament is by invitation only.";
    if (tournament.visibility === TournamentVisibility.PRIVATE) return "Players are entered by the tournament's host.";
    return null;
  }

  private ageOf(tournament: Tournament, candidate: Candidate): number | null {
    const dob = candidate.studentProfile?.dateOfBirth ?? null;
    if (!dob) return null;
    const rules = parseTournamentEligibility(tournament.eligibilityJson);
    const cutoff = rules.ageCutoffDate ? new Date(`${rules.ageCutoffDate}T00:00:00.000Z`) : tournament.startsAt;
    return ageOn(dob, cutoff);
  }

  private eligibilityIssue(tournament: Tournament, candidate: Candidate): string | null {
    return tournamentEligibilityIssue(parseTournamentEligibility(tournament.eligibilityJson), {
      age: this.ageOf(tournament, candidate),
      batchIds: candidate.studentBatches.map((b) => b.batchId),
      experienceLevel: candidate.studentProfile?.experienceLevel ?? null,
      rating: candidate.studentProfile?.chessRating ?? null
    });
  }

  /** Coach reach (same rule as pulling students into a class): students of their live batches. */
  private reachWhere(user: TournamentViewer): Prisma.UserWhereInput {
    if (isAdminRole(user.role)) return {};
    return {
      studentBatches: {
        some: {
          batch: { coaches: { some: { coachId: user.id, isDeleted: false } }, isDeleted: false, status: { not: BatchStatus.ARCHIVED } },
          isDeleted: false
        }
      }
    };
  }
}
