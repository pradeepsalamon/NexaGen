import {
  canReadKnowledgeArticle,
  knowledgeAudienceForRole,
  type KnowledgeAudience,
  type KnowledgeUserRole,
  type KnowledgeVersionDto,
  type KnowledgeVersionSummary,
} from "@nexa-chess/types";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type KnowledgeActor = { id: string; role: UserRole };

/** Who a help-centre read is for: a real user, or a role staff are previewing as. */
export type KnowledgeReader = { audience: KnowledgeAudience; batchIds: string[] };

const personSelect = { firstName: true, id: true, lastName: true } as const;

export const versionInclude = {
  author: { select: personSelect },
  reviewedBy: { select: personSelect },
} satisfies Prisma.KnowledgeArticleVersionInclude;

export type VersionRow = Prisma.KnowledgeArticleVersionGetPayload<{ include: typeof versionInclude }>;

export const personName = (u: { firstName: string; lastName: string | null }) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ") || "Unknown";

const person = (u: { id: string; firstName: string; lastName: string | null } | null) =>
  u ? { id: u.id, name: personName(u) } : null;

export function toVersionSummary(v: VersionRow): KnowledgeVersionSummary {
  return {
    author: person(v.author),
    changeNote: v.changeNote,
    createdAt: v.createdAt.toISOString(),
    id: v.id,
    number: v.number,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    reviewNote: v.reviewNote,
    reviewedBy: person(v.reviewedBy),
    status: v.status,
    title: v.title,
    updatedAt: v.updatedAt.toISOString(),
    warnings: v.warnings,
  };
}

export function toVersionDto(v: VersionRow): KnowledgeVersionDto {
  return {
    ...toVersionSummary(v),
    body: v.body,
    pgn: v.pgn,
    resourceRef: v.resourceRef,
    resourceType: v.resourceType,
    summary: v.summary,
  };
}

/** The batches a user reads through: a student's enrolments, a coach's batches. */
export async function readerForUser(prisma: PrismaService, user: KnowledgeActor): Promise<KnowledgeReader> {
  const audience = knowledgeAudienceForRole(user.role as KnowledgeUserRole);
  if (user.role === UserRole.STUDENT) {
    const rows = await prisma.batchStudent.findMany({ select: { batchId: true }, where: { studentId: user.id } });
    return { audience, batchIds: rows.map((r) => r.batchId) };
  }
  if (user.role === UserRole.COACH) {
    const rows = await prisma.batchCoach.findMany({ select: { batchId: true }, where: { coachId: user.id } });
    return { audience, batchIds: rows.map((r) => r.batchId) };
  }
  return { audience, batchIds: [] };
}

/**
 * The Prisma form of `canReadKnowledgeArticle` (@nexa-chess/types): live,
 * the reader's audience listed, and batch scope matched. Every reader query
 * goes through this, inside the same query that fetches the rows.
 */
export function readerWhere(reader: KnowledgeReader, now: Date): Prisma.KnowledgeArticleWhereInput {
  const and: Prisma.KnowledgeArticleWhereInput[] = [
    { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
    { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  ];
  if (reader.audience !== "ADMIN") {
    and.push({ OR: [{ batchScoped: false }, { batches: { some: { batchId: { in: reader.batchIds } } } }] });
  }
  return {
    AND: and,
    audience: { has: reader.audience },
    publishedVersionId: { not: null },
    status: "PUBLISHED",
  };
}

/** Belt and braces for rows fetched by id: re-check with the shared rule. */
export function assertReadable(
  reader: KnowledgeReader,
  article: {
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    publishedVersionId: string | null;
    audience: KnowledgeAudience[];
    batchScoped: boolean;
    batches: { batchId: string }[];
    publishAt: Date | null;
    expiresAt: Date | null;
  },
  now: Date,
): boolean {
  return canReadKnowledgeArticle(
    reader,
    {
      audience: article.audience,
      batchIds: article.batches.map((b) => b.batchId),
      batchScoped: article.batchScoped,
      expiresAt: article.expiresAt,
      hasPublishedVersion: article.publishedVersionId !== null,
      publishAt: article.publishAt,
      status: article.status,
    },
    now,
  );
}
