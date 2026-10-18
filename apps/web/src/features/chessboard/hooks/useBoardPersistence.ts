import { useEffect, useRef, type MutableRefObject } from "react";
import type { LiveBoardState } from "@nexa-chess/types";
import type { createBoardStore } from "../store/createBoardStore";
import { boardStateChanged, fromLiveBoardState, toLiveBoardState } from "../lib/boardSnapshot";
import {
  getBoardState,
  saveBoardState,
  saveBoardStateOnUnload,
} from "@/features/live-class/api/live-class";

/** Saves are throttled to one per interval (the route is rate limited per IP). */
const SAVE_INTERVAL_MS = 2_000;

/**
 * Coach-side gate: until the saved board has been restored, the coach's board is
 * the empty start position and must not be broadcast as FORCE_SYNC (it would
 * wipe every student's board) or saved over the real snapshot.
 */
export interface RestoreGate {
  ready: boolean;
  pendingForceSync: boolean;
}

interface Options {
  store: ReturnType<typeof createBoardStore> | null;
  classId: string | undefined;
  /** The authoritative coach window: restores, then saves every change. */
  writer: boolean;
  /** A student: fills the board from the snapshot when no coach answers first. */
  reader: boolean;
  gate: MutableRefObject<RestoreGate>;
  /** Sends any FORCE_SYNC held back while the gate was closed. */
  flushForceSync: () => void;
}

/**
 * Durable board recovery. The board itself is synced peer-to-peer; this keeps a
 * server-side copy (`LiveSession.boardState`) so a coach refresh or crash, or a
 * class where everyone reloaded, comes back to the same position.
 */
export function useBoardPersistence({ store, classId, writer, reader, gate, flushForceSync }: Options) {
  const flushRef = useRef(flushForceSync);
  flushRef.current = flushForceSync;

  // Coach: restore, then open the gate.
  useEffect(() => {
    if (!writer || !store || !classId) {
      gate.current.ready = true;
      return;
    }
    gate.current.ready = false;
    let cancelled = false;
    const before = store.getState();

    getBoardState(classId)
      .then(({ state }) => {
        if (cancelled || !state) return;
        const now = store.getState();
        // Something already changed the board (a move, a remote sync): keep it.
        if (now.remoteSyncId !== before.remoteSyncId || now.fen !== before.fen || now.pgn !== before.pgn) return;
        now.syncFromRemote(fromLiveBoardState(state));
        gate.current.pendingForceSync = true;
      })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        gate.current.ready = true;
        flushRef.current();
      });

    return () => {
      cancelled = true;
    };
  }, [writer, store, classId, gate]);

  // Coach: save every shared change, throttled, one request in flight.
  useEffect(() => {
    if (!writer || !store || !classId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let dirty = false;
    let lastSaveAt = 0;

    const save = () => {
      timer = null;
      if (!dirty || !gate.current.ready) return;
      if (inFlight) {
        schedule();
        return;
      }
      dirty = false;
      inFlight = true;
      lastSaveAt = Date.now();
      saveBoardState(classId, toLiveBoardState(store.getState()))
        .catch(() => {
          dirty = true;
        })
        .finally(() => {
          inFlight = false;
          if (dirty) schedule();
        });
    };

    function schedule() {
      if (timer) return;
      timer = setTimeout(save, Math.max(0, SAVE_INTERVAL_MS - (Date.now() - lastSaveAt)));
    }

    const unsubscribe = store.subscribe((state, prev) => {
      if (!boardStateChanged(state, prev)) return;
      dirty = true;
      schedule();
    });

    // A refresh or tab close must not lose the last few moves.
    const onPageHide = () => {
      if (!dirty || !gate.current.ready) return;
      dirty = false;
      saveBoardStateOnUnload(classId, toLiveBoardState(store.getState()));
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", onPageHide);
      if (timer) clearTimeout(timer);
      onPageHide();
    };
  }, [writer, store, classId, gate]);

  // Student: use the snapshot unless a coach's FORCE_SYNC got there first.
  useEffect(() => {
    if (!reader || !store || !classId) return;
    let cancelled = false;
    const before = store.getState().remoteSyncId;

    getBoardState(classId)
      .then(({ state }: { state: LiveBoardState | null }) => {
        if (cancelled || !state) return;
        const now = store.getState();
        if (now.isDetached || now.remoteSyncId !== before) return;
        now.syncFromRemote(fromLiveBoardState(state));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [reader, store, classId]);
}
