"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Download, X } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useChessAppearance } from "@/features/chess-appearance/context/ChessAppearanceProvider";
import { BoardContext } from "@/features/chessboard/context/BoardProvider";
import { Chess } from "@/lib/chess";
import { useOptionalMatch } from "../../../../providers/MatchProvider";
import { useOptionalSimul } from "../../../../providers/SimulProvider";
import { downloadBlob, slugify } from "../../../../lib/interactives/canvas";
import {
  buildFrames,
  estimateSeconds,
  renderGameVideo,
  supportedVideoMime,
  type VideoGame,
} from "../../../../lib/interactives/gameVideo";
import { CoachRunsThis, type ToolContext } from "../shared";

type Source = { id: string; label: string; game: VideoGame };

const PASTE = "paste";

/** A PGN → game, or an error message. Headers fill in the players and result. */
function parsePgn(pgn: string): VideoGame | string {
  if (!pgn.trim()) return "Paste a PGN to use it.";
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const headers = chess.getHeaders();
    const moves = chess.history();
    if (moves.length === 0) return "That PGN has no moves.";
    return {
      black: headers.Black && headers.Black !== "?" ? headers.Black : "Black",
      moves,
      result: headers.Result ?? null,
      startFen: headers.FEN || undefined,
      white: headers.White && headers.White !== "?" ? headers.White : "White",
    };
  } catch {
    return "That PGN couldn't be read.";
  }
}

export function VideoGeneratorTool({ isManager }: ToolContext) {
  const board = useContext(BoardContext);
  const match = useOptionalMatch();
  const simul = useOptionalSimul();
  const { currentPieceSet } = useChessAppearance();
  const mime = useMemo(() => supportedVideoMime(), []);

  const [boardPgn] = useState(() => board?.getState().fullPgn ?? "");
  const sources = useMemo<Source[]>(() => {
    const list: Source[] = [];
    if (boardPgn) {
      const g = parsePgn(boardPgn);
      if (typeof g !== "string")
        list.push({
          game: { ...g, black: "Black", white: "White" },
          id: "board",
          label: "Class board (current game)",
        });
    }
    for (const g of match?.round?.games ?? []) {
      if (g.moves.length === 0) continue;
      list.push({
        game: {
          black: g.black.name,
          moves: g.moves.map((m) => m.san),
          result: g.result,
          startFen: g.startFen,
          white: g.white.name,
        },
        id: `match-${g.id}`,
        label: `Match: ${g.white.name} vs ${g.black.name}`,
      });
    }
    for (const g of simul?.simul?.games ?? []) {
      if (g.moves.length === 0) continue;
      const coachWhite = g.coachColor === "white";
      list.push({
        game: {
          black: coachWhite ? g.studentName : "Coach",
          moves: g.moves.map((m) => m.san),
          result: g.result,
          startFen: simul?.simul?.startFen,
          white: coachWhite ? "Coach" : g.studentName,
        },
        id: `simul-${g.id}`,
        label: `Simul: ${g.studentName}`,
      });
    }
    return list;
  }, [boardPgn, match?.round?.games, simul?.simul]);

  const [sourceId, setSourceId] = useState(sources[0]?.id ?? PASTE);
  const [pgn, setPgn] = useState("");
  const [title, setTitle] = useState("Game of the day");
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [speed, setSpeed] = useState("1");
  const [lastPlies, setLastPlies] = useState("0");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<{
    url: string;
    blob: Blob;
    mime: string;
  } | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Free the preview and stop a render when the panel closes.
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(
    () => () => {
      if (video) URL.revokeObjectURL(video.url);
    },
    [video],
  );

  const selected: VideoGame | string =
    sourceId === PASTE
      ? parsePgn(pgn)
      : (sources.find((s) => s.id === sourceId)?.game ?? "Choose a game.");

  const frameInfo = useMemo(() => {
    if (typeof selected === "string") return { error: selected, frames: 0 };
    try {
      return {
        error: null,
        frames: buildFrames(selected, Number(lastPlies)).length,
      };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "That game can't be replayed.",
        frames: 0,
      };
    }
  }, [selected, lastPlies]);

  if (!isManager) {
    return (
      <CoachRunsThis>
        Your coach creates highlight videos of class games.
      </CoachRunsThis>
    );
  }

  if (!mime) {
    return (
      <Alert
        title="Video export isn't available in this browser"
        variant="warning"
      >
        Highlight videos are recorded on your device, which needs a browser that
        can record the page (Chrome, Edge or Safari on a computer). Nothing is
        generated here.
      </Alert>
    );
  }

  const busy = progress !== null;
  const seconds = frameInfo.frames
    ? Math.round(estimateSeconds(frameInfo.frames, Number(speed)))
    : 0;
  const ext = video?.mime.includes("mp4") ? "mp4" : "webm";

  const generate = async () => {
    if (typeof selected === "string" || frameInfo.error) return;
    setError(null);
    if (video) {
      URL.revokeObjectURL(video.url);
      setVideo(null);
    }
    const controller = new AbortController();
    abort.current = controller;
    setProgress(0);
    try {
      const { blob, mime: type } = await renderGameVideo(
        selected,
        {
          lastPlies: Number(lastPlies),
          orientation,
          pieceSet: currentPieceSet,
          secondsPerMove: Number(speed),
          title: title.trim() || "Nexa Chess",
        },
        setProgress,
        controller.signal,
      );
      setVideo({ blob, mime: type, url: URL.createObjectURL(blob) });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(
          e instanceof Error ? e.message : "The video couldn't be created.",
        );
      }
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="vg-source">Game</Label>
        <Select
          disabled={busy}
          id="vg-source"
          onChange={(e) => setSourceId(e.target.value)}
          options={[
            ...sources.map((s) => ({ label: s.label, value: s.id })),
            { label: "Paste a PGN…", value: PASTE },
          ]}
          value={sourceId}
        />
        {sources.length === 0 ? (
          <p className="text-xs text-app-muted">
            No class games with moves yet — play on the board, run matches or a
            simul, or paste a PGN.
          </p>
        ) : null}
      </div>
      {sourceId === PASTE ? (
        <Textarea
          aria-label="PGN"
          className="min-h-28 font-mono text-xs"
          disabled={busy}
          onChange={(e) => setPgn(e.target.value)}
          placeholder={
            '[White "Morphy"]\n[Black "Duke"]\n\n1. e4 e5 2. Nf3 d6 …'
          }
          value={pgn}
        />
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="vg-title">Video title</Label>
        <Input
          disabled={busy}
          id="vg-title"
          maxLength={60}
          onChange={(e) => setTitle(e.target.value)}
          value={title}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="vg-side">View</Label>
          <Select
            disabled={busy}
            id="vg-side"
            onChange={(e) => setOrientation(e.target.value as "white" | "black")}
            options={[
              { label: "White", value: "white" },
              { label: "Black", value: "black" }
            ]}
            value={orientation}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vg-speed">Speed</Label>
          <Select
            disabled={busy}
            id="vg-speed"
            onChange={(e) => setSpeed(e.target.value)}
            options={[
              { label: "Fast", value: "0.6" },
              { label: "Normal", value: "1" },
              { label: "Slow", value: "1.6" }
            ]}
            value={speed}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vg-moves">Moves</Label>
          <Select
            disabled={busy}
            id="vg-moves"
            onChange={(e) => setLastPlies(e.target.value)}
            options={[
              { label: "All", value: "0" },
              { label: "Last 10", value: "10" },
              { label: "Last 20", value: "20" }
            ]}
            value={lastPlies}
          />
        </div>
      </div>

      {frameInfo.error && !(sourceId === PASTE && !pgn.trim()) ? (
        <Alert variant="error">{frameInfo.error}</Alert>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}

      {busy ? (
        <div className="space-y-2" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-app-soft">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-app-muted">
              Recording in real time — keep this tab open.
            </p>
            <Button
              onClick={() => abort.current?.abort()}
              size="sm"
              variant="outline"
            >
              <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-app-muted">
            {seconds ? `About ${seconds}s of video.` : ""}
          </p>
          <Button disabled={!!frameInfo.error} onClick={() => void generate()}>
            <Clapperboard
              aria-hidden="true"
              className="size-4"
              strokeWidth={2.5}
            />
            {video ? "Create again" : "Create video"}
          </Button>
        </div>
      )}

      {video ? (
        <div className="space-y-2">
          <video
            className="w-full rounded-app bg-app-text"
            controls
            playsInline
            src={video.url}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-app-muted">
              Made on this device — not uploaded or saved to Nexa. Download it
              to keep it.
            </p>
            <Button
              onClick={() =>
                downloadBlob(video.blob, `${slugify(title)}.${ext}`)
              }
            >
              <Download
                aria-hidden="true"
                className="size-4"
                strokeWidth={2.5}
              />
              Download .{ext}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
