import { Injectable, Logger } from "@nestjs/common";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import { ordinal, type SystemMessageKey } from "@nexa-chess/types";
import { TournamentFormat, TournamentGameStatus, TournamentPlayerStatus, TournamentRoundStatus, TournamentStatus } from "@prisma/client";
import { BrandingService } from "../branding/branding.service";
import { SystemNotifier } from "../mail/system-notifier.service";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { PrismaService } from "../prisma/prisma.service";

const STARTING_SOON_MS = 15 * 60_000;
/** Pairings older than this are not announced late (a tick that was down for a while). */
const PAIRING_FRESH_MS = 10 * 60_000;

type Recipient = { userId: string; firstName: string; email: string | null; phone: string | null };

const recipientSelect = { email: true, firstName: true, id: true, phoneNumber: true } as const;

/**
 * Tournament notifications (docs/TOURNAMENTS.md Phase 8) through the existing
 * SystemNotifier (in-app, email and WhatsApp, switchable per message by the
 * academy's admins in the system-message catalogue). Event messages are sent
 * after the change commits. Scheduled ones (starting soon, pairings, round
 * results, completion) are claim-first: the tick marks the row with a filtered
 * `updateMany`, and only the process that claimed it sends, so a message never
 * goes out twice. Sending never throws into the caller.
 */
@Injectable()
export class TournamentNotifierService {
  private readonly logger = new Logger(TournamentNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: SystemNotifier,
    private readonly branding: BrandingService,
    private readonly messaging: MessagingDispatchService
  ) {}

  // ── event messages (called after commit) ──

  registeredInBackground(playerId: string) {
    void this.entry(playerId, "TOURNAMENT_REGISTERED").catch((error) => this.warn("registered", error));
  }

  invitedInBackground(playerId: string) {
    void this.entry(playerId, "TOURNAMENT_INVITED").catch((error) => this.warn("invited", error));
  }

  announcementInBackground(tournamentId: string, body: string) {
    void this.toPlayers(tournamentId, "TOURNAMENT_ANNOUNCEMENT", () => ({ "announcement.body": body }), `announcement:${Date.now()}`).catch((error) =>
      this.warn("announcement", error)
    );
  }

  resultsPublishedInBackground(tournamentId: string) {
    void this.resultsPublished(tournamentId).catch((error) => this.warn("results", error));
  }

  // ── scheduled messages (the tournament tick) ──

  async tick(now = new Date()): Promise<void> {
    await this.registrationOpen(now);
    await this.started(now);
    await this.startingSoon(now);
    await this.pairings(now);
    await this.roundsCompleted();
    await this.completed();
  }

  /**
   * The admin messaging rules (docs/MESSAGING.md): "registration open" once a
   * published tournament's registration window opens, "tournament started"
   * once it goes live. Claim-first like the rest; the rule decides whether
   * anything is sent, on which channels and with what wording.
   */
  private async registrationOpen(now: Date) {
    const due = await this.prisma.tournament.findMany({
      select: { id: true },
      take: 50,
      where: {
        OR: [{ registrationOpensAt: null }, { registrationOpensAt: { lte: now } }],
        registrationAnnouncedAt: null,
        startsAt: { gt: now },
        status: TournamentStatus.PUBLISHED
      }
    });
    for (const t of due) {
      if (!(await this.claim("tournament", t.id, "registrationAnnouncedAt"))) continue;
      this.messaging.dispatchInBackground({ event: "TOURNAMENT_REGISTRATION_OPEN", tournamentId: t.id });
    }
  }

  private async started(now: Date) {
    const due = await this.prisma.tournament.findMany({
      select: { id: true },
      take: 50,
      where: { startedAnnouncedAt: null, startedAt: { gte: new Date(now.getTime() - PAIRING_FRESH_MS) }, status: { in: [TournamentStatus.LIVE, TournamentStatus.PAUSED] } }
    });
    for (const t of due) {
      if (!(await this.claim("tournament", t.id, "startedAnnouncedAt"))) continue;
      this.messaging.dispatchInBackground({ event: "TOURNAMENT_STARTED", tournamentId: t.id });
    }
  }

  private async startingSoon(now: Date) {
    const due = await this.prisma.tournament.findMany({
      select: { id: true, startsAt: true },
      where: { startingSoonNotifiedAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + STARTING_SOON_MS) }, status: TournamentStatus.PUBLISHED }
    });
    for (const t of due) {
      if (!(await this.claim("tournament", t.id, "startingSoonNotifiedAt"))) continue;
      const minutes = Math.max(1, Math.round((t.startsAt.getTime() - now.getTime()) / 60_000));
      await this.toPlayers(t.id, "TOURNAMENT_STARTING_SOON", () => ({ "tournament.startsIn": `in ${minutes} minute${minutes === 1 ? "" : "s"}` }), "starting-soon");
    }
  }

  private async pairings(now: Date) {
    const games = await this.prisma.tournamentGame.findMany({
      include: {
        blackPlayer: { select: { user: { select: recipientSelect } } },
        tournament: { select: { format: true, id: true, name: true } },
        whitePlayer: { select: { user: { select: recipientSelect } } }
      },
      take: 500,
      where: { blackPlayerId: { not: null }, notifiedAt: null, startedAt: { gte: new Date(now.getTime() - PAIRING_FRESH_MS) }, status: TournamentGameStatus.ONGOING }
    });
    for (const g of games) {
      if (!g.blackPlayer || !(await this.claim("game", g.id, "notifiedAt"))) continue;
      const round = g.tournament.format === TournamentFormat.ARENA ? "New game" : `Round ${g.roundNumber}`;
      const link = `${getFrontendUrl(getApiEnv())}/tournaments/${g.tournament.id}/games/${g.id}`;
      for (const [me, them, color] of [
        [g.whitePlayer.user, g.blackPlayer.user, "White"],
        [g.blackPlayer.user, g.whitePlayer.user, "Black"]
      ] as const) {
        await this.send("TOURNAMENT_PAIRED", this.recipient(me), g.tournament, {
          "game.color": color,
          "game.opponent": `${them.firstName}`,
          "game.round": round,
          "links.game": link
        }, `paired:${g.id}`);
      }
    }
  }

  private async roundsCompleted() {
    const rounds = await this.prisma.tournamentRound.findMany({
      select: { id: true, number: true, tournament: { select: { format: true, id: true, name: true, status: true } } },
      take: 100,
      where: { notifiedAt: null, status: TournamentRoundStatus.COMPLETED }
    });
    for (const r of rounds) {
      if (!(await this.claim("round", r.id, "notifiedAt"))) continue;
      // The last round's news is the tournament's completion message.
      if (r.tournament.status === TournamentStatus.COMPLETED) continue;
      await this.toPlayers(r.tournament.id, "TOURNAMENT_ROUND_COMPLETED", (p) => ({ "round.number": String(r.number), "standing.line": this.standingLine(p, r.tournament.format) }), `round:${r.id}`);
    }
  }

  private async completed() {
    const done = await this.prisma.tournament.findMany({
      select: { format: true, id: true },
      take: 50,
      where: { completedNotifiedAt: null, status: TournamentStatus.COMPLETED }
    });
    for (const t of done) {
      if (!(await this.claim("tournament", t.id, "completedNotifiedAt"))) continue;
      await this.toPlayers(t.id, "TOURNAMENT_COMPLETED", (p) => ({ "standing.line": this.standingLine(p, t.format) }), "completed");
    }
  }

  private async resultsPublished(tournamentId: string) {
    const t = await this.prisma.tournament.findUnique({ select: { format: true }, where: { id: tournamentId } });
    if (!t) return;
    const certificates = await this.prisma.tournamentCertificate.findMany({ select: { userId: true }, where: { revokedAt: null, tournamentId } });
    const withCertificate = new Set(certificates.map((c) => c.userId));
    await this.toPlayers(
      tournamentId,
      "TOURNAMENT_RESULTS_PUBLISHED",
      (p) => ({
        "certificate.line": withCertificate.has(p.userId) ? "Your certificate is ready to download from the tournament page." : "",
        "standing.line": this.standingLine(p, t.format)
      }),
      "results"
    );
  }

  // ── helpers ──

  private async entry(playerId: string, key: "TOURNAMENT_REGISTERED" | "TOURNAMENT_INVITED") {
    const player = await this.prisma.tournamentPlayer.findUnique({
      select: { status: true, tournament: { select: { id: true, name: true } }, user: { select: recipientSelect } },
      where: { id: playerId }
    });
    if (!player) return;
    const statusLine =
      player.status === TournamentPlayerStatus.PENDING
        ? `your entry in ${player.tournament.name} is waiting for the host's approval.`
        : `you're entered in ${player.tournament.name}. Good luck!`;
    await this.send(key, this.recipient(player.user), player.tournament, { "registration.statusLine": statusLine }, `${key}:${playerId}:${player.status}`);
  }

  private async toPlayers(
    tournamentId: string,
    key: SystemMessageKey,
    variables: (p: { userId: string; rank: number | null; points: number }) => Record<string, string>,
    dedupe: string
  ) {
    const tournament = await this.prisma.tournament.findUnique({ select: { id: true, name: true }, where: { id: tournamentId } });
    if (!tournament) return;
    const players = await this.prisma.tournamentPlayer.findMany({
      select: { points: true, rank: true, user: { select: recipientSelect }, userId: true },
      where: { status: TournamentPlayerStatus.APPROVED, tournamentId }
    });
    for (const p of players) {
      await this.send(key, this.recipient(p.user), tournament, variables(p), `${dedupe}:${tournamentId}`);
    }
  }

  private async send(key: SystemMessageKey, to: Recipient, tournament: { id: string; name: string }, extra: Record<string, string>, dedupeKey: string) {
    try {
      await this.notifier.send(
        key,
        { email: to.email, phone: to.phone, userId: to.userId },
        {
          "academy.name": await this.branding.nameFor(),
          "links.tournament": `${getFrontendUrl(getApiEnv())}/tournaments/${tournament.id}`,
          "recipient.firstName": to.firstName,
          "tournament.name": tournament.name,
          ...extra
        },
        { dedupeKey: `tournament:${dedupeKey}` }
      );
    } catch (error) {
      this.warn(key, error);
    }
  }

  private recipient(u: { id: string; firstName: string; email: string | null; phoneNumber: string | null }): Recipient {
    return { email: u.email, firstName: u.firstName, phone: u.phoneNumber, userId: u.id };
  }

  private standingLine(p: { rank: number | null; points: number }, format: TournamentFormat): string {
    if (p.rank === null) return "";
    const points = format === TournamentFormat.ARENA ? `${p.points}` : `${p.points / 2}`;
    return `You are ${ordinal(p.rank)} with ${points} point${points === "1" ? "" : "s"}.`;
  }

  /** Claim-first: true only for the one caller that set the marker. */
  private async claim(kind: "tournament" | "round" | "game", id: string, field: string): Promise<boolean> {
    const data = { [field]: new Date() };
    const where = { [field]: null, id };
    const { count } =
      kind === "tournament"
        ? await this.prisma.tournament.updateMany({ data, where })
        : kind === "round"
          ? await this.prisma.tournamentRound.updateMany({ data, where })
          : await this.prisma.tournamentGame.updateMany({ data, where });
    return count === 1;
  }

  private warn(what: string, error: unknown) {
    // Never names, emails or bodies in logs (students are minors).
    this.logger.warn(`tournament notification failed (${what}): ${error instanceof Error ? error.message : String(error)}`);
  }
}
