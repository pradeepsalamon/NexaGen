import { BadRequestException, Injectable } from "@nestjs/common";
import {
  encodeLiveClassToolsMessage,
  LIVE_CLASS_TOOL_SCOPE,
  LIVE_CLASS_TOOL_STATE_SCHEMAS,
  LIVE_CLASS_TOOLS_TOPIC,
  liveClassToolKindSchema,
  type LiveClassToolEntry,
  type LiveClassToolKind,
  type LiveClassToolResponse,
  type LiveClassToolsResponse
} from "@nexa-chess/types";
import type { LiveClassToolState, Prisma } from "@prisma/client";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaService } from "../prisma/prisma.service";

type ScopedSession = { batchId: string | null; classId: string };

/**
 * Saved state for the live-class "Interactives" (Mystery Box goal, teams,
 * classroom timer…). Any participant reads it; only the class's coach or an
 * admin writes it. The state is validated against the tool's shared schema, so
 * a client can't park arbitrary JSON here.
 */
@Injectable()
export class ClassroomToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly liveClass: LiveClassService
  ) {}

  async list(accessToken: string | undefined, classId: string): Promise<LiveClassToolsResponse> {
    const { liveSession } = await this.liveClass.resolveParticipant(accessToken, classId);
    const keys = this.scopeKeys(liveSession);
    const rows = await this.prisma.liveClassToolState.findMany({
      where: { scopeKey: { in: [...new Set(Object.values(keys))] } }
    });

    const tools: LiveClassToolsResponse["tools"] = {};
    for (const row of rows) {
      // A row under the batch key belongs to a BATCH tool only (and vice versa).
      if (keys[row.tool] !== row.scopeKey) continue;
      const entry = this.toEntry(row);
      if (entry) (tools as Record<string, LiveClassToolEntry>)[row.tool] = entry;
    }
    return { serverTime: new Date().toISOString(), tools };
  }

  async update(
    accessToken: string | undefined,
    classId: string,
    rawTool: string,
    rawState: unknown
  ): Promise<LiveClassToolResponse> {
    const { user, liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const parsedTool = liveClassToolKindSchema.safeParse(rawTool);
    if (!parsedTool.success) throw new BadRequestException("Unknown classroom tool.");
    const tool = parsedTool.data;

    const parsedState = LIVE_CLASS_TOOL_STATE_SCHEMAS[tool].safeParse(rawState);
    if (!parsedState.success) {
      throw new BadRequestException(parsedState.error.issues[0]?.message ?? "Invalid tool state.");
    }
    const state = parsedState.data as Prisma.InputJsonValue;

    const scopeKey = this.scopeKeys(liveSession)[tool];
    const isBatch = scopeKey.startsWith("batch:");

    const row = await this.prisma.liveClassToolState.upsert({
      where: { scopeKey_tool: { scopeKey, tool } },
      create: {
        batchId: isBatch ? liveSession.batchId : null,
        liveClassId: isBatch ? null : liveSession.classId,
        scopeKey,
        state,
        tool,
        updatedById: user.id
      },
      update: { state, updatedById: user.id }
    });

    try {
      await this.livekit.broadcastData(
        liveSession.roomName,
        encodeLiveClassToolsMessage({ tool, type: "TOOL_CHANGED" }),
        LIVE_CLASS_TOOLS_TOPIC
      );
    } catch {
      // Nudge only — REST is authoritative and clients refetch on a slow poll.
    }

    return { entry: this.toEntry(row), serverTime: new Date().toISOString(), tool };
  }

  /** The scope key every tool's state lives under for this class. */
  private scopeKeys(session: ScopedSession): Record<LiveClassToolKind, string> {
    const keys = {} as Record<LiveClassToolKind, string>;
    for (const tool of liveClassToolKindSchema.options) {
      keys[tool] =
        LIVE_CLASS_TOOL_SCOPE[tool] === "BATCH" && session.batchId
          ? `batch:${session.batchId}`
          : `class:${session.classId}`;
    }
    return keys;
  }

  /** Drops a row whose stored JSON no longer matches the current schema. */
  private toEntry(row: LiveClassToolState): LiveClassToolEntry | null {
    const parsed = LIVE_CLASS_TOOL_STATE_SCHEMAS[row.tool].safeParse(row.state);
    if (!parsed.success) return null;
    return { state: parsed.data, updatedAt: row.updatedAt.toISOString() } as LiveClassToolEntry;
  }
}
