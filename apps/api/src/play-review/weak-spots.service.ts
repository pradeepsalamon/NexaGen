import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  INITIAL_PUZZLE_RATING,
  TACTIC_MOTIF_LABELS,
  TACTIC_MOTIFS,
  WEAK_SPOT_LICHESS_THEMES,
  WEAK_SPOT_TIPS,
  createAssignmentRequestSchema,
  readWeakSpotTipRequestSchema,
  resolveWeakSpotTip,
  weakSpotHomeworkDescription,
  weakSpotHomeworkRequestSchema,
  weakSpotHomeworkTitle,
  weakSpotMotifSchema,
  type ReadWeakSpotTipRequest,
  type TacticMotif,
  type WeakSpotHomeworkRequest,
  type WeakSpotHomeworkResponse,
  type WeakSpotProfileResponse,
  type WeakSpotTipsResponse
} from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import { AssignmentService } from "../assignment/assignment.service";
import { authenticateUser } from "../auth/authenticate";
import { parseOrBadRequest } from "../common/zod-body.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanViewStudent } from "../progress/student-access";
import { PuzzleTrainingService } from "../puzzle/puzzle-training.service";
import { requireTenantId } from "../tenancy/tenant-sql";
import { loadTipReadings, loadWeakSpotProfile } from "./weak-spot-profile";

const isStaffRole = (role: UserRole) => role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN || role === UserRole.COACH;

/** The set's level, from the rating its puzzles sit around. */
function difficultyFor(rating: number): "BEGINNER" | "INTERMEDIATE" | "ADVANCED" {
  if (rating < 1000) return "BEGINNER";
  if (rating < 1500) return "INTERMEDIATE";
  return "ADVANCED";
}

/**
 * A student's weak spots (docs/WEAK_SPOTS.md): the pure
 * `buildWeakSpotProfile` over their reviewed play and puzzle results. Never
 * stored; the engine decided every miss. Staff see every tip; a student sees
 * only the tips a coach or admin of their academy read (WS-4).
 */
@Injectable()
export class WeakSpotsService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentService,
    private readonly training: PuzzleTrainingService
  ) {}

  /** The student's coach and admins (a student uses `getMine`). */
  async getFor(accessToken: string | undefined, studentId: string, now: Date = new Date()): Promise<WeakSpotProfileResponse> {
    const viewer = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (viewer.role === UserRole.STUDENT) throw new ForbiddenException("This view is for coaches and admins.");
    await assertCanViewStudent(this.prisma, viewer, studentId);
    return this.build(studentId, now);
  }

  /** The student's own card: weak spots and strengths, tips only once read. */
  async getMine(accessToken: string | undefined, now: Date = new Date()): Promise<WeakSpotProfileResponse> {
    const viewer = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (viewer.role !== UserRole.STUDENT) throw new ForbiddenException("Only students have their own weak spots.");
    const profile = await loadWeakSpotProfile(this.prisma, viewer.id, { audience: "STUDENT", now });
    return { ...profile, others: [] };
  }

  build(studentId: string, now: Date): Promise<WeakSpotProfileResponse> {
    return loadWeakSpotProfile(this.prisma, studentId, { audience: "STAFF", now });
  }

  // ── Tips (WS-4) ──────────────────────────────────────────────

  async listTips(accessToken: string | undefined): Promise<WeakSpotTipsResponse> {
    await this.getStaff(accessToken);
    const rows = await this.prisma.weakSpotTipReview.findMany({
      select: { motif: true, reviewedAt: true, reviewedById: true }
    });
    const readings = await loadTipReadings(this.prisma);
    const reviewerIds = [...new Set(rows.map((r) => r.reviewedById).filter((id): id is string => !!id))];
    const reviewers = reviewerIds.length
      ? await this.prisma.user.findMany({ select: { firstName: true, id: true, lastName: true }, where: { id: { in: reviewerIds } } })
      : [];
    const names = new Map(reviewers.map((u) => [u.id, `${u.firstName} ${u.lastName ?? ""}`.trim()]));
    const rowOf = new Map(rows.map((r) => [r.motif, r]));
    return {
      tips: TACTIC_MOTIFS.map((motif) => {
        const resolved = resolveWeakSpotTip(motif, readings[motif]);
        const row = resolved.status === "NOT_READ" ? undefined : rowOf.get(motif);
        return {
          builtInText: WEAK_SPOT_TIPS[motif],
          label: TACTIC_MOTIF_LABELS[motif],
          motif,
          reviewedAt: row ? row.reviewedAt.toISOString() : null,
          reviewedByName: row?.reviewedById ? (names.get(row.reviewedById) ?? null) : null,
          status: resolved.status,
          text: resolved.status === "READ" ? resolved.staffText : WEAK_SPOT_TIPS[motif]
        };
      })
    };
  }

  /** Mark a tip read (optionally reworded): the academy's students see it from now on. */
  async readTip(accessToken: string | undefined, rawMotif: string, body: ReadWeakSpotTipRequest): Promise<WeakSpotTipsResponse> {
    const viewer = await this.getStaff(accessToken);
    const motif = this.motifOf(rawMotif);
    const { text } = parseOrBadRequest(readWeakSpotTipRequestSchema, body);
    const tenantId = requireTenantId("weakSpotTipReview");
    const reading = { baseText: WEAK_SPOT_TIPS[motif], reviewedAt: new Date(), reviewedById: viewer.id, text };
    await this.prisma.weakSpotTipReview.upsert({
      create: { ...reading, motif, tenantId },
      update: reading,
      where: { tenantId_motif: { motif, tenantId } }
    });
    return this.listTips(accessToken);
  }

  /** Hide a tip from students again. */
  async unreadTip(accessToken: string | undefined, rawMotif: string): Promise<WeakSpotTipsResponse> {
    await this.getStaff(accessToken);
    const motif = this.motifOf(rawMotif);
    await this.prisma.weakSpotTipReview.deleteMany({ where: { motif } });
    return this.listTips(accessToken);
  }

  // ── Make homework (WS-5) ─────────────────────────────────────

  /**
   * Catalogue puzzles on one weak spot, near the student's puzzle rating and
   * new to them, saved as a puzzle-set assignment in the author's library —
   * not assigned to anyone until the coach edits and assigns it. The title and
   * description never name the student (it may go to the whole batch).
   */
  async makeHomework(
    accessToken: string | undefined,
    studentId: string,
    body: WeakSpotHomeworkRequest
  ): Promise<WeakSpotHomeworkResponse> {
    const viewer = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (!isStaffRole(viewer.role)) throw new ForbiddenException("Only coaches and admins make homework.");
    await assertCanViewStudent(this.prisma, viewer, studentId);
    const { count, motif } = parseOrBadRequest(weakSpotHomeworkRequestSchema, body);
    const themes = WEAK_SPOT_LICHESS_THEMES[motif];
    if (themes.length === 0) {
      throw new BadRequestException(`There are no puzzles for "${TACTIC_MOTIF_LABELS[motif]}" — practise it from the examples instead.`);
    }

    const progress = await this.prisma.studentProgress.findUnique({ select: { puzzleRating: true }, where: { studentId } });
    const targetRating = progress?.puzzleRating ?? INITIAL_PUZZLE_RATING;
    const puzzleIds = await this.training.pickPracticePuzzles({ actorId: viewer.id, count, studentId, targetRating, themes });
    if (puzzleIds.length === 0) {
      throw new ConflictException("No new puzzles for this pattern near the student's rating right now.");
    }

    const title = weakSpotHomeworkTitle(motif);
    const created = await this.assignments.create(
      accessToken,
      parseOrBadRequest(createAssignmentRequestSchema, {
        activityType: "PUZZLE_SET",
        description: weakSpotHomeworkDescription(motif, targetRating),
        difficulty: difficultyFor(targetRating),
        puzzleIds,
        title
      })
    );
    return { assignmentId: created.assignment.id, puzzleCount: puzzleIds.length, targetRating, title };
  }

  // ── internals ──

  private async getStaff(accessToken: string | undefined) {
    const viewer = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (!isStaffRole(viewer.role)) throw new ForbiddenException("Only coaches and admins read the tips.");
    return viewer;
  }

  private motifOf(raw: string): TacticMotif {
    return parseOrBadRequest(weakSpotMotifSchema, raw);
  }
}
