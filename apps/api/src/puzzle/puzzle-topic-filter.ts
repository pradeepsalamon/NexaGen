import { collectPuzzleTopicSubtreeIds } from "@nexa-chess/types";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

/** Puzzle filter for a folder: the folder alone, or (default) with every subfolder. */
export async function puzzleTopicWhere(
  prisma: PrismaService,
  topicId: string,
  scope: "direct" | "subtree" = "subtree"
): Promise<Prisma.PuzzleWhereInput> {
  if (scope === "direct") return { topicId };
  const links = await prisma.puzzleTopic.findMany({ select: { id: true, parentId: true } });
  return { topicId: { in: collectPuzzleTopicSubtreeIds(links, topicId) } };
}
