import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  knowledgeGetArticleToolArgsSchema,
  knowledgeSearchToolArgsSchema,
  type AssistantToolResult,
  type KnowledgeGetArticleToolArgs,
  type KnowledgeSearchToolArgs,
} from "@nexa-chess/types";
import { ASSISTANT_TOOL_TEXT_LIMIT, type AssistantTool, type AssistantToolSource } from "../ai/tools/assistant-tool";
import { authenticateUser } from "../auth/authenticate";
import { PrismaService } from "../prisma/prisma.service";
import { readerForUser } from "./knowledge.shared";
import { KnowledgeService } from "./knowledge.service";

const ALL_ROLES = ["SUPER_ADMIN", "ADMIN", "COACH", "STUDENT"] as const;

/**
 * Knowledge-base tools for the assistant. Both read through the help centre's
 * own reader rules for the caller (`readerForUser` + `readerWhere`), so a
 * student's assistant can never see a coach- or admin-only article. Searches
 * made by tools are not logged in the unanswered inbox.
 */
@Injectable()
export class KnowledgeToolsProvider implements AssistantToolSource {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
  ) {}

  assistantTools(): AssistantTool[] {
    const search: AssistantTool<KnowledgeSearchToolArgs> = {
      args: knowledgeSearchToolArgsSchema,
      description:
        "Search the academy's help centre (how the platform works, navigation, FAQs, course material and games) " +
        "for articles the current user may read. Returns titles, slugs and short snippets.",
      kind: "READ",
      name: "knowledge.search",
      roles: ALL_ROLES,
      run: (token, args) => this.search(token, args),
    };
    const getArticle: AssistantTool<KnowledgeGetArticleToolArgs> = {
      args: knowledgeGetArticleToolArgsSchema,
      description: "Read one help-centre article (by the slug knowledge.search returned) the current user may read.",
      kind: "READ",
      name: "knowledge.get_article",
      roles: ALL_ROLES,
      run: (token, args) => this.getArticle(token, args),
    };
    return [search as AssistantTool, getArticle as AssistantTool];
  }

  private async search(accessToken: string | undefined, args: KnowledgeSearchToolArgs): Promise<AssistantToolResult> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    const reader = await readerForUser(this.prisma, user);
    const found = await this.knowledge.helpFor(reader, { q: args.query, route: args.route }, false);
    const results = found.articles.slice(0, 8).map((a) => ({
      forThisPage: a.forThisPage,
      kind: a.kind,
      slug: a.slug,
      snippet: a.snippet,
      summary: a.summary,
      title: a.title,
    }));
    return { citations: results.map((r) => ({ slug: r.slug, title: r.title })), data: { results }, ok: true };
  }

  private async getArticle(accessToken: string | undefined, args: KnowledgeGetArticleToolArgs): Promise<AssistantToolResult> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    const reader = await readerForUser(this.prisma, user);
    const article = await this.knowledge.articleFor(reader, args.slug, null);
    const truncated = article.body.length > ASSISTANT_TOOL_TEXT_LIMIT;
    return {
      citations: [{ slug: article.slug, title: article.title, versionNumber: article.versionNumber }],
      data: {
        body: truncated ? `${article.body.slice(0, ASSISTANT_TOOL_TEXT_LIMIT)}…` : article.body,
        kind: article.kind,
        pgn: article.pgn,
        resource: article.resourceType ? { ref: article.resourceRef, type: article.resourceType } : null,
        slug: article.slug,
        summary: article.summary,
        title: article.title,
        truncated,
      },
      ok: true,
    };
  }
}
