import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CHESS_GAME_RESULTS,
  PGN_IMPORT_LIMITS,
  STANDARD_START_FEN,
  lineThroughPath,
  moveTreeHasVariations,
  moveTreeToPgn,
  parsePgnToMoveTree,
  splitPgnGames,
  type ImportPgnResponse,
  type ImportPgnSide,
} from '@nexa-chess/types';
import { ChessGameSource, ChessGameStatus, type ExternalChessProvider } from '@prisma/client';
import { createMoveTreeChess } from '../common/chess/move-tree-chess';
import { gameFingerprint } from '../game-analysis/report-builder';
import { PrismaService } from '../prisma/prisma.service';
import { chessComOpeningName } from './providers/chess-com.provider';
import { pgnPlayedAt } from './providers/provider';

export type StoreGameInput = {
  pgn: string;
  /** The student whose game it is (null = a coach's import, no owner). */
  ownerId: string | null;
  createdById: string;
  side: ImportPgnSide;
  /** Names the owner plays under, for AUTO side matching. */
  names: string[];
  external?: { provider: ExternalChessProvider; externalId: string; url: string | null; accountId: string };
};

export type StoreGameOutcome =
  | { kind: 'IMPORTED'; gameId: string; sideMatched: boolean }
  | { kind: 'DUPLICATE'; gameId: string }
  | { kind: 'FAILED'; reason: string };

const isResult = (value: string) => (CHESS_GAME_RESULTS as readonly string[]).includes(value);
const intOrNull = (value: string | undefined) => {
  const n = value && /^\d{1,4}$/.test(value.trim()) ? Number(value.trim()) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const clip = (value: string | undefined, max: number) => (value?.trim() ? value.trim().slice(0, max) : null);

/**
 * Stores a student's own games from PGN text — an upload or a provider sync.
 * Every game is replayed (illegal moves refuse that game, not the batch),
 * kept with its headers, comments, clocks and variations, and stored once
 * per owner (unique contentHash = start position + mainline).
 */
@Injectable()
export class GameImportService {
  constructor(private readonly prisma: PrismaService) {}

  async importText(input: Omit<StoreGameInput, 'pgn' | 'external'> & { text: string }): Promise<ImportPgnResponse> {
    if (input.text.length > PGN_IMPORT_LIMITS.maxChars) {
      throw new BadRequestException(`A PGN upload can be at most ${PGN_IMPORT_LIMITS.maxChars} characters.`);
    }
    const texts = splitPgnGames(input.text, PGN_IMPORT_LIMITS.maxGames + 1);
    if (texts.length === 0) throw new BadRequestException("That file doesn't contain any games.");
    if (texts.length > PGN_IMPORT_LIMITS.maxGames) {
      throw new BadRequestException(`Upload at most ${PGN_IMPORT_LIMITS.maxGames} games at a time.`);
    }
    const out: ImportPgnResponse = { duplicates: 0, failed: [], gameIds: [], imported: 0, unmatchedSide: 0 };
    for (const [index, pgn] of texts.entries()) {
      const outcome = await this.store({ ...input, pgn });
      if (outcome.kind === 'IMPORTED') {
        out.imported += 1;
        out.gameIds.push(outcome.gameId);
        if (input.ownerId && !outcome.sideMatched) out.unmatchedSide += 1;
      } else if (outcome.kind === 'DUPLICATE') {
        out.duplicates += 1;
      } else {
        out.failed.push({ index, reason: outcome.reason });
      }
    }
    return out;
  }

  async store(input: StoreGameInput): Promise<StoreGameOutcome> {
    let parsed;
    try {
      parsed = parsePgnToMoveTree(input.pgn, createMoveTreeChess);
    } catch (error) {
      return { kind: 'FAILED', reason: (error as Error).message || 'That game could not be read.' };
    }
    const mainline = lineThroughPath(parsed.tree, []).nodes;
    if (mainline.length === 0 && parsed.tree.rootFen === STANDARD_START_FEN) return { kind: 'FAILED', reason: 'The game has no moves.' };
    if (mainline.length > PGN_IMPORT_LIMITS.maxPlies) {
      return { kind: 'FAILED', reason: `The game is longer than ${PGN_IMPORT_LIMITS.maxPlies} half-moves.` };
    }
    const h = parsed.headers;
    if (h.Variant && !/^(standard|chess)$/i.test(h.Variant.trim())) return { kind: 'FAILED', reason: `${h.Variant} games aren't supported.` };

    const contentHash = gameFingerprint({ movesUci: mainline.map((n) => n.uci), startFen: parsed.tree.rootFen });
    if (input.ownerId) {
      const existing = await this.prisma.chessGame.findFirst({
        select: { id: true },
        where: {
          OR: [
            { contentHash, ownerId: input.ownerId },
            ...(input.external
              ? [{ externalId: input.external.externalId, externalProvider: input.external.provider, ownerId: input.ownerId }]
              : []),
          ],
        },
      });
      if (existing) return { gameId: existing.id, kind: 'DUPLICATE' };
    }

    const white = h.White?.trim() || 'White';
    const black = h.Black?.trim() || 'Black';
    const ownSide = this.matchSide(input.side, input.names, white, black);
    const result = isResult(parsed.result) ? parsed.result : '*';
    const startedAt = pgnPlayedAt(h) ?? new Date();
    const safeStart = startedAt.getTime() > Date.now() + 86_400_000 ? new Date() : startedAt;
    try {
      const row = await this.prisma.chessGame.create({
        data: {
          blackName: black.slice(0, 100),
          blackPlayerId: input.ownerId && ownSide === 'black' ? input.ownerId : null,
          blackRating: intOrNull(h.BlackElo),
          contentHash: input.ownerId ? contentHash : null,
          createdById: input.createdById,
          eco: clip(h.ECO, 8),
          endedAt: result === '*' ? null : safeStart,
          externalAccountId: input.external?.accountId ?? null,
          externalId: input.external?.externalId ?? null,
          externalProvider: input.external?.provider ?? null,
          externalUrl: input.external?.url ?? null,
          hasVariations: moveTreeHasVariations(parsed.tree),
          moveCount: mainline.length,
          openingName: clip(h.Opening, 120) ?? chessComOpeningName(h.ECOUrl),
          ownerId: input.ownerId,
          pgn: moveTreeToPgn(parsed.tree, { ...h, Result: result }),
          result,
          source: ChessGameSource.IMPORT,
          startFen: parsed.tree.rootFen,
          startedAt: safeStart,
          // A finished record (any result, even "*") is a completed game: nothing is being played.
          status: ChessGameStatus.COMPLETED,
          termination: clip(h.Termination, 100),
          timeControl: clip(h.TimeControl, 30),
          title: (h.Event?.trim() && !/^(\?|casual|rated|live chess)/i.test(h.Event) ? h.Event.trim() : `${white} vs ${black}`).slice(0, 200),
          whiteName: white.slice(0, 100),
          whitePlayerId: input.ownerId && ownSide === 'white' ? input.ownerId : null,
          whiteRating: intOrNull(h.WhiteElo),
        },
        select: { id: true },
      });
      return { gameId: row.id, kind: 'IMPORTED', sideMatched: ownSide !== null };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const dup = await this.prisma.chessGame.findFirst({ select: { id: true }, where: { contentHash, ownerId: input.ownerId } });
        if (dup) return { gameId: dup.id, kind: 'DUPLICATE' };
      }
      throw error;
    }
  }

  /** Which colour the owner played: explicit, or the one whose PGN name matches. */
  matchSide(side: ImportPgnSide, names: string[], white: string, black: string): 'white' | 'black' | null {
    if (side === 'WHITE') return 'white';
    if (side === 'BLACK') return 'black';
    if (side === 'NONE') return null;
    const wanted = new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean));
    const w = wanted.has(white.toLowerCase());
    const b = wanted.has(black.toLowerCase());
    if (w === b) return null; // neither, or both (ambiguous): don't guess
    return w ? 'white' : 'black';
  }
}
