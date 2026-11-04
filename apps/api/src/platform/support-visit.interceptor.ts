import { type CallHandler, type ExecutionContext, Injectable, Logger, type NestInterceptor } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { Observable } from "rxjs";
import { verifyAccessToken } from "../auth/authenticate";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform } from "../tenancy/tenant-context";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Logs every request made during a platform support visit with the visit id
 * (which names the staff member and their reason), and counts its writes on
 * the visit (docs/SAAS_MULTI_TENANCY.md §I "Support access"). Reads the
 * token's `support` claim only, so ordinary requests cost nothing.
 */
@Injectable()
export class SupportVisitInterceptor implements NestInterceptor {
  private readonly logger = new Logger("SupportVisit");

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== "http") return next.handle();
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[AUTH_COOKIE_NAMES.accessToken] as string | undefined;
    if (!token) return next.handle();
    const payload = await verifyAccessToken(this.jwtService, token).catch(() => null);
    if (!payload?.support) return next.handle();
    const write = !SAFE_METHODS.has(request.method.toUpperCase());
    this.logger.log({ method: request.method, path: request.path, supportSessionId: payload.support, write }, "support visit request");
    if (write) {
      await asPlatform("support visit: count a write", () =>
        this.prisma.platformSupportSession.updateMany({
          data: { actionCount: { increment: 1 } },
          where: { id: payload.support }
        })
      );
    }
    return next.handle();
  }
}
