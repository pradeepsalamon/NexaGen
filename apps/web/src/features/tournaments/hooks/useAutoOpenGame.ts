"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const opened = new Set<string>();
const storageKey = (gameId: string) => `nexa-tournament-game-opened:${gameId}`;

function wasOpened(gameId: string): boolean {
  if (opened.has(gameId)) return true;
  try {
    return window.sessionStorage.getItem(storageKey(gameId)) !== null;
  } catch {
    return false;
  }
}

/** Remembers that this tab has shown the game's board (so the lobby doesn't pull the player back to it). */
export function markGameOpened(gameId: string) {
  opened.add(gameId);
  try {
    window.sessionStorage.setItem(storageKey(gameId), "1");
  } catch {
    // Private mode: the in-memory set still covers this page load.
  }
}

/**
 * Takes a player to their board the moment they are paired (a round starts, an
 * arena pairing lands), from the tournament page or from their finished game.
 * Once per game and per tab: a player who then walks back to the lobby stays
 * there and sees the "Play" banner instead.
 */
export function useAutoOpenGame(tournamentId: string, gameId: string | null | undefined, currentGameId?: string) {
  const router = useRouter();
  useEffect(() => {
    if (!gameId || gameId === currentGameId || wasOpened(gameId)) return;
    markGameOpened(gameId);
    router.push(`/tournaments/${tournamentId}/games/${gameId}`);
  }, [currentGameId, gameId, router, tournamentId]);
}
