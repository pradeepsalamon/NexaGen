import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { ApprovalCoachOptionsResponse, ApprovalStudentOptionsResponse } from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { PrismaService } from "../prisma/prisma.service";

const MIN_SEARCH_LENGTH = 2;
const MAX_STUDENT_OPTIONS = 20;

const fullName = (u: { firstName: string; lastName: string | null }) => `${u.firstName} ${u.lastName ?? ""}`.trim();

/**
 * What a coach's request forms need to pick from. Students are found only by
 * typing a name (never listed up front), the same reach the in-class pull search
 * has, and both lists carry names only.
 */
@Injectable()
export class ApprovalOptionsService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  private async authenticateCoach(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.COACH) throw new ForbiddenException("Only coaches make these requests.");
    return user;
  }

  async students(accessToken: string | undefined, search?: string): Promise<ApprovalStudentOptionsResponse> {
    await this.authenticateCoach(accessToken);
    const q = search?.trim() ?? "";
    if (q.length < MIN_SEARCH_LENGTH) return { students: [] };
    const rows = await this.prisma.user.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { firstName: true, id: true, lastName: true, username: true },
      take: MAX_STUDENT_OPTIONS,
      where: {
        isDeleted: false,
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { username: { contains: q, mode: "insensitive" } }
        ],
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE
      }
    });
    return { students: rows.map((row) => ({ id: row.id, name: fullName(row), username: row.username })) };
  }

  /** Colleagues who could take the caller's class, the batch's own coaches first. */
  async substitutes(accessToken: string | undefined, classId: string): Promise<ApprovalCoachOptionsResponse> {
    const user = await this.authenticateCoach(accessToken);
    const cls = await this.prisma.coachClass.findUnique({
      select: { batchId: true, coachId: true },
      where: { id: classId }
    });
    if (!cls || cls.coachId !== user.id) throw new NotFoundException("Class not found.");

    const [coaches, links] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        select: { firstName: true, id: true, lastName: true },
        where: { id: { not: user.id }, isDeleted: false, role: UserRole.COACH, status: UserStatus.ACTIVE }
      }),
      cls.batchId
        ? this.prisma.batchCoach.findMany({
            select: { coachId: true },
            where: { batchId: cls.batchId, isDeleted: false }
          })
        : Promise.resolve([])
    ]);
    const inBatch = new Set(links.map((link) => link.coachId));
    return {
      coaches: coaches
        .map((coach) => ({ id: coach.id, inBatch: inBatch.has(coach.id), name: fullName(coach) }))
        .sort((a, b) => Number(b.inBatch) - Number(a.inBatch))
    };
  }
}
