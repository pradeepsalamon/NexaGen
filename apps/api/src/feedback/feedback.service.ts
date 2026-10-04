import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  averageRating,
  FEEDBACK_RATING_MAX,
  feedbackQuestionSchema,
  type CoachRatingSummary,
  type CoachRatingsResponse,
  type FeedbackFormDto,
  type FeedbackFormListResponse,
  type FeedbackQuestion,
  type FeedbackQuestionType,
  type FeedbackResponseDto,
  type FeedbackResponseListQuery,
  type FeedbackResponseListResponse,
  type MyCoachFeedbackResponse,
  type PendingFeedbackItem,
  type PendingFeedbackQuery,
  type PendingFeedbackResponse,
  type SkipFeedbackRequest,
  type SubmitFeedbackRequest,
  type UpsertFeedbackFormRequest
} from "@nexa-chess/types";
import {
  AttendanceStatus,
  ClassStatus,
  FeedbackResponseStatus,
  Prisma,
  UserRole,
  UserStatus,
  type FeedbackForm,
  type User
} from "@prisma/client";
import { paginationMeta, resolvePagination } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import {
  computePendingFeedback,
  responseKey,
  validateFeedbackAnswers,
  type AttendedClassInput,
  type PendingCandidate,
  type PendingFormInput
} from "./feedback-pending.util";
import { authenticateUser } from "../auth/authenticate";

type AuthenticatedUser = Pick<User, "id" | "role" | "status">;

const responseInclude = {
  answers: true,
  class: { select: { title: true, topic: true } },
  coach: { select: { firstName: true, lastName: true } },
  form: { select: { title: true } },
  student: { select: { firstName: true, lastName: true } }
} satisfies Prisma.FeedbackResponseInclude;

type ResponseRow = Prisma.FeedbackResponseGetPayload<{ include: typeof responseInclude }>;

const fullName = (u: { firstName: string; lastName: string | null }) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ");

@Injectable()
export class FeedbackService {

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  // ── Admin: forms ──

  async listForms(accessToken: string | undefined): Promise<FeedbackFormListResponse> {
    this.assertAdmin(await this.getAuthenticatedUser(accessToken));

    const forms = await this.prisma.feedbackForm.findMany({
      include: { _count: { select: { responses: true } } },
      orderBy: { createdAt: "desc" }
    });

    return { forms: forms.map((form) => this.toFormDto(form, form._count.responses)) };
  }

  async createForm(
    accessToken: string | undefined,
    body: UpsertFeedbackFormRequest
  ): Promise<{ form: FeedbackFormDto }> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertAdmin(user);

    const form = await this.prisma.feedbackForm.create({
      data: { ...this.toFormData(body), createdById: user.id }
    });

    return { form: this.toFormDto(form, 0) };
  }

  async updateForm(
    accessToken: string | undefined,
    id: string,
    body: UpsertFeedbackFormRequest
  ): Promise<{ form: FeedbackFormDto }> {
    this.assertAdmin(await this.getAuthenticatedUser(accessToken));
    await this.getFormOrThrow(id);

    const form = await this.prisma.feedbackForm.update({
      where: { id },
      data: this.toFormData(body),
      include: { _count: { select: { responses: true } } }
    });

    return { form: this.toFormDto(form, form._count.responses) };
  }

  async deleteForm(accessToken: string | undefined, id: string): Promise<{ success: true }> {
    this.assertAdmin(await this.getAuthenticatedUser(accessToken));
    await this.getFormOrThrow(id);

    const responses = await this.prisma.feedbackResponse.count({ where: { formId: id } });
    if (responses > 0) {
      throw new BadRequestException(
        "This form already has responses. Deactivate it instead so its ratings are kept."
      );
    }

    await this.prisma.feedbackForm.delete({ where: { id } });
    return { success: true };
  }

  // ── Admin: results ──

  async listResponses(
    accessToken: string | undefined,
    query: FeedbackResponseListQuery
  ): Promise<FeedbackResponseListResponse> {
    this.assertAdmin(await this.getAuthenticatedUser(accessToken));

    const { page, pageSize, skip, take } = resolvePagination({
      page: query.page as number | undefined,
      pageSize: query.pageSize as number | undefined
    });
    const where: Prisma.FeedbackResponseWhereInput = {
      status: FeedbackResponseStatus.SUBMITTED,
      ...(query.formId ? { formId: query.formId } : {}),
      ...(query.coachId ? { coachId: query.coachId } : {})
    };

    const [total, rows] = await Promise.all([
      this.prisma.feedbackResponse.count({ where }),
      this.prisma.feedbackResponse.findMany({
        where,
        include: responseInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take
      })
    ]);

    return {
      responses: rows.map((row) => this.toResponseDto(row, false)),
      pagination: paginationMeta(total, page, pageSize)
    };
  }

  async getCoachRatings(accessToken: string | undefined): Promise<CoachRatingsResponse> {
    this.assertAdmin(await this.getAuthenticatedUser(accessToken));

    const coaches = await this.prisma.user.findMany({
      where: { role: UserRole.COACH, status: UserStatus.ACTIVE },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" }
    });

    const summaries = await this.summarizeCoaches(
      coaches.map((c) => ({ id: c.id, name: fullName(c) })),
      {}
    );

    // Rated coaches first (best first), unrated after, alphabetical.
    summaries.sort((a, b) => (b.averageRating ?? -1) - (a.averageRating ?? -1));
    return { coaches: summaries };
  }

  // ── Coach ──

  async getMyFeedback(accessToken: string | undefined): Promise<MyCoachFeedbackResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role !== UserRole.COACH) {
      throw new ForbiddenException("Only coaches have their own feedback.");
    }

    const coach = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { firstName: true, lastName: true }
    });

    // Coaches only ever see forms the admin opened up to them, and anonymously.
    const visible: Prisma.FeedbackResponseWhereInput = {
      coachId: user.id,
      form: { showToCoach: true },
      status: FeedbackResponseStatus.SUBMITTED
    };

    const [[summary], questionGroups, recent] = await Promise.all([
      this.summarizeCoaches([{ id: user.id, name: fullName(coach) }], { form: { showToCoach: true } }),
      this.prisma.feedbackAnswer.groupBy({
        by: ["questionId", "questionLabel"],
        where: { ratingValue: { not: null }, response: visible },
        _avg: { ratingValue: true },
        _count: { ratingValue: true }
      }),
      this.prisma.feedbackResponse.findMany({
        where: visible,
        include: responseInclude,
        orderBy: { createdAt: "desc" },
        take: 20
      })
    ]);

    return {
      summary,
      questions: questionGroups.map((g) => ({
        questionId: g.questionId,
        questionLabel: g.questionLabel,
        averageRating: Math.round((g._avg.ratingValue ?? 0) * 10) / 10,
        count: g._count.ratingValue
      })),
      recent: recent.map((row) => this.toResponseDto(row, true))
    };
  }

  // ── Student ──

  async getPending(
    accessToken: string | undefined,
    query: PendingFeedbackQuery
  ): Promise<PendingFeedbackResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role !== UserRole.STUDENT) {
      return { items: [] };
    }

    const candidates = await this.computePendingFor(user.id, new Date());
    const filtered = candidates.filter(
      (c) =>
        (!query.placement || c.form.placements.includes(query.placement)) &&
        (!query.classId || c.classId === query.classId)
    );

    const coachIds = [...new Set(filtered.map((c) => c.coachId))];
    const coaches = await this.prisma.user.findMany({
      where: { id: { in: coachIds } },
      select: { id: true, firstName: true, lastName: true }
    });
    const coachNames = new Map(coaches.map((c) => [c.id, fullName(c)]));

    return {
      items: filtered.map((c) => this.toPendingItem(c, coachNames.get(c.coachId) ?? "Your coach"))
    };
  }

  async submit(
    accessToken: string | undefined,
    body: SubmitFeedbackRequest
  ): Promise<{ success: true }> {
    const user = await this.getAuthenticatedUser(accessToken);
    const candidate = await this.resolveOwnCandidate(user, body);

    const result = validateFeedbackAnswers(candidate.form.questions, body.answers);
    if (!result.ok) {
      throw new BadRequestException(result.errors);
    }

    const ratings = result.answers
      .map((a) => a.ratingValue)
      .filter((v): v is number => v !== null);

    await this.createResponse({
      answers: {
        create: result.answers.map((a) => ({
          questionId: a.question.id,
          questionLabel: a.question.label,
          questionType: a.question.type,
          ratingValue: a.ratingValue,
          textValue: a.textValue
        }))
      },
      classId: candidate.classId,
      coachId: candidate.coachId,
      contextKey: candidate.contextKey,
      formId: candidate.form.id,
      overallRating: averageRating(ratings),
      status: FeedbackResponseStatus.SUBMITTED,
      studentId: user.id
    });

    return { success: true };
  }

  async skip(accessToken: string | undefined, body: SkipFeedbackRequest): Promise<{ success: true }> {
    const user = await this.getAuthenticatedUser(accessToken);
    const candidate = await this.resolveOwnCandidate(user, body);

    if (!candidate.form.allowSkip) {
      throw new BadRequestException("This feedback can't be skipped.");
    }

    await this.createResponse({
      classId: candidate.classId,
      coachId: candidate.coachId,
      contextKey: candidate.contextKey,
      formId: candidate.form.id,
      status: FeedbackResponseStatus.SKIPPED,
      studentId: user.id
    });

    return { success: true };
  }

  // ── Internals ──

  /**
   * The target must be one the server itself says is open for this student —
   * the client's formId/coachId/contextKey are never trusted on their own.
   */
  private async resolveOwnCandidate(
    user: AuthenticatedUser,
    target: { formId: string; coachId: string; contextKey: string }
  ): Promise<PendingCandidate> {
    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException("Only students can give feedback.");
    }

    const candidates = await this.computePendingFor(user.id, new Date());
    const wanted = responseKey(target.formId, target.coachId, target.contextKey);
    const candidate = candidates.find(
      (c) => responseKey(c.form.id, c.coachId, c.contextKey) === wanted
    );

    if (!candidate) {
      throw new NotFoundException("This feedback is no longer open.");
    }
    return candidate;
  }

  private async createResponse(data: Prisma.FeedbackResponseUncheckedCreateInput) {
    try {
      await this.prisma.feedbackResponse.create({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("You've already answered this feedback.");
      }
      throw error;
    }
  }

  private async computePendingFor(studentId: string, now: Date): Promise<PendingCandidate[]> {
    const forms = await this.prisma.feedbackForm.findMany({
      where: {
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }]
      }
    });
    if (forms.length === 0) return [];

    const [attendance, answered] = await Promise.all([
      this.prisma.classAttendance.findMany({
        where: {
          studentId,
          status: { not: AttendanceStatus.ABSENT },
          class: { batchId: { not: null }, isDemo: false, status: ClassStatus.COMPLETED }
        },
        select: {
          class: {
            select: {
              batchId: true,
              coachId: true,
              endsAt: true,
              id: true,
              liveSession: { select: { endedAt: true } },
              title: true,
              topic: true
            }
          }
        },
        orderBy: { class: { startsAt: "desc" } },
        take: 500
      }),
      this.prisma.feedbackResponse.findMany({
        where: { studentId, formId: { in: forms.map((f) => f.id) } },
        select: { coachId: true, contextKey: true, formId: true }
      })
    ]);

    const attended: AttendedClassInput[] = attendance.map(({ class: cls }) => ({
      batchId: cls.batchId as string,
      classId: cls.id,
      classTitle: cls.title ?? cls.topic,
      coachId: cls.coachId,
      endedAt: cls.liveSession?.endedAt ?? cls.endsAt
    }));

    return computePendingFeedback({
      answered: new Set(answered.map((r) => responseKey(r.formId, r.coachId, r.contextKey))),
      attended,
      forms: forms.map((form) => this.toPendingFormInput(form)),
      now
    });
  }

  private async summarizeCoaches(
    coaches: { id: string; name: string }[],
    extraWhere: Prisma.FeedbackResponseWhereInput
  ): Promise<CoachRatingSummary[]> {
    const ids = coaches.map((c) => c.id);
    const where: Prisma.FeedbackResponseWhereInput = {
      ...extraWhere,
      coachId: { in: ids },
      overallRating: { not: null },
      status: FeedbackResponseStatus.SUBMITTED
    };

    const [groups, ratings] = await Promise.all([
      this.prisma.feedbackResponse.groupBy({
        by: ["coachId"],
        where,
        _avg: { overallRating: true },
        _count: { _all: true },
        _max: { createdAt: true }
      }),
      this.prisma.feedbackResponse.findMany({
        where,
        select: { coachId: true, overallRating: true }
      })
    ]);

    const byCoach = new Map(groups.map((g) => [g.coachId, g]));
    const distributions = new Map<string, number[]>();
    for (const r of ratings) {
      const dist = distributions.get(r.coachId) ?? new Array(FEEDBACK_RATING_MAX).fill(0);
      const star = Math.min(FEEDBACK_RATING_MAX, Math.max(1, Math.round(r.overallRating ?? 1)));
      dist[star - 1] += 1;
      distributions.set(r.coachId, dist);
    }

    return coaches.map((coach) => {
      const group = byCoach.get(coach.id);
      return {
        averageRating:
          group?._avg.overallRating != null ? Math.round(group._avg.overallRating * 10) / 10 : null,
        coachId: coach.id,
        coachName: coach.name,
        distribution: distributions.get(coach.id) ?? new Array(FEEDBACK_RATING_MAX).fill(0),
        lastResponseAt: group?._max.createdAt?.toISOString() ?? null,
        responseCount: group?._count._all ?? 0
      };
    });
  }

  private async getFormOrThrow(id: string) {
    const form = await this.prisma.feedbackForm.findUnique({ where: { id } });
    if (!form) {
      throw new NotFoundException("Feedback form not found.");
    }
    return form;
  }

  private toFormData(body: UpsertFeedbackFormRequest) {
    return {
      allowSkip: body.allowSkip,
      batchIds: body.batchIds,
      classInterval: body.classInterval,
      description: body.description?.trim() || null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      expiresAfterDays: body.expiresAfterDays,
      intervalDays: body.trigger === "RECURRING" ? (body.intervalDays ?? null) : null,
      isActive: body.isActive,
      placements: body.placements,
      questions: body.questions as unknown as Prisma.InputJsonValue,
      showToCoach: body.showToCoach,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      title: body.title,
      trigger: body.trigger
    };
  }

  /** Stored JSON is re-validated on read, so one bad row can't break a student's page. */
  private parseQuestions(raw: Prisma.JsonValue): FeedbackQuestion[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((q) => {
      const parsed = feedbackQuestionSchema.safeParse(q);
      return parsed.success ? [parsed.data] : [];
    });
  }

  private toPendingFormInput(form: FeedbackForm): PendingFormInput {
    return {
      allowSkip: form.allowSkip,
      batchIds: form.batchIds,
      classInterval: form.classInterval,
      createdAt: form.createdAt,
      description: form.description,
      endsAt: form.endsAt,
      expiresAfterDays: form.expiresAfterDays,
      id: form.id,
      intervalDays: form.intervalDays,
      placements: form.placements,
      questions: this.parseQuestions(form.questions),
      startsAt: form.startsAt,
      title: form.title,
      trigger: form.trigger
    };
  }

  private toFormDto(form: FeedbackForm, responseCount: number): FeedbackFormDto {
    return {
      allowSkip: form.allowSkip,
      batchIds: form.batchIds,
      classInterval: form.classInterval,
      createdAt: form.createdAt.toISOString(),
      description: form.description,
      endsAt: form.endsAt?.toISOString() ?? null,
      expiresAfterDays: form.expiresAfterDays,
      id: form.id,
      intervalDays: form.intervalDays,
      isActive: form.isActive,
      placements: form.placements,
      questions: this.parseQuestions(form.questions),
      responseCount,
      showToCoach: form.showToCoach,
      startsAt: form.startsAt?.toISOString() ?? null,
      title: form.title,
      trigger: form.trigger,
      updatedAt: form.updatedAt.toISOString()
    };
  }

  private toPendingItem(candidate: PendingCandidate, coachName: string): PendingFeedbackItem {
    return {
      allowSkip: candidate.form.allowSkip,
      classEndedAt: candidate.classEndedAt?.toISOString() ?? null,
      classId: candidate.classId,
      classTitle: candidate.classTitle,
      coachId: candidate.coachId,
      coachName,
      contextKey: candidate.contextKey,
      expiresAt: candidate.expiresAt?.toISOString() ?? null,
      formDescription: candidate.form.description,
      formId: candidate.form.id,
      formTitle: candidate.form.title,
      placements: candidate.form.placements,
      questions: candidate.form.questions
    };
  }

  private toResponseDto(row: ResponseRow, anonymous: boolean): FeedbackResponseDto {
    return {
      answers: row.answers.map((a) => ({
        questionId: a.questionId,
        questionLabel: a.questionLabel,
        questionType: a.questionType as FeedbackQuestionType,
        ratingValue: a.ratingValue,
        textValue: a.textValue
      })),
      classId: row.classId,
      classTitle: row.class ? (row.class.title ?? row.class.topic) : null,
      coachId: row.coachId,
      coachName: fullName(row.coach),
      createdAt: row.createdAt.toISOString(),
      formId: row.formId,
      formTitle: row.form.title,
      id: row.id,
      overallRating: row.overallRating,
      studentId: anonymous ? null : row.studentId,
      studentName: anonymous ? null : fullName(row.student)
    };
  }

  private getAuthenticatedUser(accessToken: string | undefined): Promise<AuthenticatedUser> {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  private assertAdmin(user: AuthenticatedUser) {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("You cannot manage feedback.");
    }
  }
}
