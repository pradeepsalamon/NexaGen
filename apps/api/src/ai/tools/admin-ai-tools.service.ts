import { ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { AssistantToolListResponse, RunAssistantToolRequest, RunAssistantToolResponse } from "@nexa-chess/types";
import { authenticateUser } from "../../auth/authenticate";
import { PrismaService } from "../../prisma/prisma.service";
import { AssistantToolRegistry } from "./assistant-tool.registry";

/**
 * Super-admin view of the assistant tools: list them, and run one as
 * yourself to check what it returns. Works with AI disabled: tools run in
 * NestJS and never contact the runtime.
 */
@Injectable()
export class AdminAiToolsService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly registry: AssistantToolRegistry,
  ) {}

  async list(accessToken: string | undefined): Promise<AssistantToolListResponse> {
    await this.assertSuperAdmin(accessToken);
    return {
      tools: [
        ...new Map(
          (["SUPER_ADMIN", "ADMIN", "COACH", "STUDENT"] as const).flatMap((role) => this.registry.describe(role)).map((t) => [t.name, t]),
        ).values(),
      ],
    };
  }

  async run(accessToken: string | undefined, body: RunAssistantToolRequest): Promise<RunAssistantToolResponse> {
    await this.assertSuperAdmin(accessToken);
    const started = Date.now();
    const result = await this.registry.run(accessToken, body.name, body.args ?? {});
    return { latencyMs: Date.now() - started, name: body.name, result };
  }

  private async assertSuperAdmin(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== "SUPER_ADMIN") throw new ForbiddenException("Only Super Admins can use AI diagnostics.");
  }
}
