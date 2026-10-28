import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { AssistantToolDescriptor, AssistantToolResult, AssistantToolRole } from "@nexa-chess/types";
import { HttpException } from "@nestjs/common";
import { z } from "zod";
import { authenticateUser } from "../../auth/authenticate";
import { parseOrBadRequest } from "../../common/zod-body.pipe";
import { KnowledgeToolsProvider } from "../../knowledge/knowledge.tools";
import { PrismaService } from "../../prisma/prisma.service";
import type { AssistantTool } from "./assistant-tool";

/**
 * Every assistant tool, by name. The assistant loop (not built yet; Phase 5b /
 * AI_FOUNDATION.md §6) will offer a model `describe(role)` and run the one
 * tool call it picks through `run`; today `/admin/ai/tools/run` is the only
 * caller, so tools can be checked before any model sees them.
 */
@Injectable()
export class AssistantToolRegistry {
  private readonly tools: Map<string, AssistantTool>;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    knowledgeTools: KnowledgeToolsProvider,
  ) {
    const all = [...knowledgeTools.assistantTools()];
    this.tools = new Map(all.map((t) => [t.name, t]));
    if (this.tools.size !== all.length) throw new Error("Duplicate assistant tool name");
  }

  /** The tools a role may use, with their argument JSON Schemas. */
  describe(role: AssistantToolRole): AssistantToolDescriptor[] {
    return [...this.tools.values()]
      .filter((t) => t.roles.includes(role))
      .map((t) => ({
        description: t.description,
        kind: t.kind,
        name: t.name,
        parameters: z.toJSONSchema(t.args) as Record<string, unknown>,
        roles: [...t.roles],
      }));
  }

  /**
   * Authenticates, checks the role may use the tool, validates the arguments
   * (400), then runs it. A refusal from the service (403/404) becomes an
   * `ok: false` result: the model is told "not found", never why.
   */
  async run(accessToken: string | undefined, name: string, args: unknown): Promise<AssistantToolResult> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    const tool = this.tools.get(name);
    if (!tool) throw new NotFoundException(`Unknown tool "${name}".`);
    if (!tool.roles.includes(user.role)) throw new ForbiddenException("This tool is not available to your role.");
    if (tool.kind !== "READ") throw new BadRequestException("Only READ tools can run in this version.");
    const parsed = parseOrBadRequest(tool.args, args, "args");
    try {
      return await tool.run(accessToken, parsed);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500 && error.getStatus() !== 401) {
        return { error: error.getStatus() === 404 ? "Not found." : "Not available.", ok: false };
      }
      throw error;
    }
  }
}
