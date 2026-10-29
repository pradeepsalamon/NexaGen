"use client";

import { useMemo, useState } from "react";
import { Download, Printer, Plus, Trash2, Trophy } from "lucide-react";
import type { WallMoment, WallOfMomentsState } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/providers/ToastProvider";
import {
  useClassroomTool,
  useSaveClassroomTool,
} from "../../../../hooks/useClassroomTools";
import { useClassLeaderboard } from "../../../../hooks/useLivePuzzle";
import {
  bodyFont,
  brandColors,
  downloadBlob,
  printImage,
  roundRect,
  slugify,
  wrapText,
} from "../../../../lib/interactives/canvas";
import {
  CoachRunsThis,
  newId,
  SectionTitle,
  ToolLoadError,
  ToolLoading,
  useToolRoster,
  type ToolContext,
} from "../shared";

const MOMENT_PRESETS = [
  { badge: "♛", title: "Brilliant move" },
  { badge: "🧩", title: "Puzzle champion" },
  { badge: "♚", title: "Checkmate artist" },
  { badge: "🔥", title: "Comeback win" },
  { badge: "📈", title: "Most improved" },
  { badge: "🤝", title: "Great sportsmanship" },
  { badge: "💡", title: "Creative idea" },
  { badge: "🛡️", title: "Rock-solid defence" },
];

const DEFAULT_WALL: WallOfMomentsState = { moments: [], title: "Hall of Fame" };

export function WallOfMomentsTool({ classId, isManager }: ToolContext) {
  const tool = useClassroomTool(classId, "WALL_OF_MOMENTS");
  const save = useSaveClassroomTool(classId, "WALL_OF_MOMENTS");
  const roster = useToolRoster(classId, isManager);
  const leaderboard = useClassLeaderboard(classId, isManager);
  const toast = useToast();

  const [studentId, setStudentId] = useState("");
  const [preset, setPreset] = useState("0");
  const [note, setNote] = useState("");
  const [title, setTitle] = useState<string | null>(null);

  const state = tool.state ?? DEFAULT_WALL;

  // Achievements this class already produced: the puzzle standings.
  const suggestions = useMemo(() => {
    const entries = (leaderboard.data?.entries ?? []).filter(
      (e) => e.solvedCount > 0,
    );
    const already = new Set(
      state.moments.map((m) => `${m.studentId}:${m.title}`),
    );
    return entries
      .slice(0, 3)
      .map((e, i) => ({
        badge: i === 0 ? "🏆" : "🧩",
        note: `${e.solvedCount} puzzle${e.solvedCount === 1 ? "" : "s"} solved · ${e.points} pts`,
        studentId: e.studentId,
        studentName: e.studentName,
        title: i === 0 ? "Top of the puzzle board" : `Puzzle podium #${e.rank}`,
      }))
      .filter((s) => !already.has(`${s.studentId}:${s.title}`));
  }, [leaderboard.data, state.moments]);

  if (tool.isLoading) return <ToolLoading />;
  if (tool.isError)
    return <ToolLoadError onRetry={() => void tool.refetch()} />;

  const addMoment = (m: Omit<WallMoment, "id" | "createdAt">) => {
    if (state.moments.length >= 60) {
      toast.warning({
        title: "The wall is full",
        message: "Remove a moment to add another.",
      });
      return;
    }
    save.mutate({
      ...state,
      moments: [
        ...state.moments,
        { ...m, createdAt: new Date().toISOString(), id: newId() },
      ],
    });
  };

  const exportImage = (mode: "download" | "print") => {
    const canvas = renderWall(state);
    if (mode === "print") {
      printImage(canvas.toDataURL("image/png"), state.title);
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${slugify(state.title)}.png`);
      else toast.error({ title: "Couldn't create the image" });
    }, "image/png");
  };

  const student = roster.batch.find((s) => s.id === studentId);
  const chosen = MOMENT_PRESETS[Number(preset)] ?? MOMENT_PRESETS[0];

  return (
    <div className="space-y-4">
      {isManager ? (
        <div className="space-y-3 rounded-app border border-app-border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="wall-title">Wall title</Label>
            <Input
              id="wall-title"
              maxLength={80}
              onBlur={() => {
                const next = (title ?? state.title).trim();
                if (next && next !== state.title)
                  save.mutate({ ...state, title: next });
                setTitle(null);
              }}
              onChange={(e) => setTitle(e.target.value)}
              value={title ?? state.title}
            />
          </div>
          <SectionTitle>Add a moment</SectionTitle>
          <Select
            aria-label="Student"
            onChange={(e) => setStudentId(e.target.value)}
            options={roster.batch.map((s) => ({ label: s.name, value: s.id }))}
            placeholder={
              roster.batch.length ? "Choose a student" : "No students yet"
            }
            value={studentId}
          />
          <Select
            aria-label="Moment"
            onChange={(e) => setPreset(e.target.value)}
            options={MOMENT_PRESETS.map((p, i) => ({
              label: `${p.badge} ${p.title}`,
              value: String(i),
            }))}
            value={preset}
          />
          <Input
            aria-label="Note (optional)"
            maxLength={240}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What happened? (optional)"
            value={note}
          />
          <div className="flex justify-end">
            <Button
              disabled={!student}
              onClick={() => {
                if (!student) return;
                addMoment({
                  badge: chosen.badge,
                  note: note.trim(),
                  studentId: student.id,
                  studentName: student.name,
                  title: chosen.title,
                });
                setNote("");
              }}
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Add to the wall
            </Button>
          </div>
          {suggestions.length > 0 ? (
            <div className="space-y-1.5">
              <SectionTitle>From today&apos;s puzzles</SectionTitle>
              {suggestions.map((s) => (
                <div
                  className="flex items-center justify-between gap-2 text-sm"
                  key={s.studentId + s.title}
                >
                  <span className="min-w-0 truncate">
                    {s.badge} <span className="font-bold">{s.studentName}</span>{" "}
                    — {s.note}
                  </span>
                  <Button
                    onClick={() => addMoment(s)}
                    size="sm"
                    variant="outline"
                  >
                    Add
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <CoachRunsThis>
          Your coach adds moments to the class wall.
        </CoachRunsThis>
      )}

      <div className="rounded-app bg-primary p-4 text-on-primary">
        <p className="flex items-center gap-2 text-lg font-extrabold">
          <Trophy aria-hidden="true" className="size-5" strokeWidth={2.5} />
          {state.title}
        </p>
        {state.moments.length === 0 ? (
          <p className="mt-2 text-sm text-on-primary/80">
            No moments yet — great play earns a spot here.
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {state.moments.map((m) => (
              <li
                className="relative rounded-control bg-app-surface p-3 text-app-text"
                key={m.id}
              >
                <p className="text-xl leading-none">{m.badge}</p>
                <p className="mt-1 text-sm font-bold">{m.title}</p>
                <p className="text-sm text-primary-ink">{m.studentName}</p>
                {m.note ? (
                  <p className="mt-0.5 text-xs text-app-muted">{m.note}</p>
                ) : null}
                {isManager ? (
                  <SimpleTooltip label="Remove">
                    <button
                      aria-label={`Remove ${m.title} for ${m.studentName}`}
                      className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-app-danger text-white transition-colors hover:bg-app-danger/85"
                      onClick={() =>
                        save.mutate({
                          ...state,
                          moments: state.moments.filter((x) => x.id !== m.id),
                        })
                      }
                      type="button"
                    >
                      <Trash2
                        aria-hidden="true"
                        className="size-3.5"
                        strokeWidth={2.5}
                      />
                    </button>
                  </SimpleTooltip>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {state.moments.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => exportImage("print")} variant="outline">
            <Printer aria-hidden="true" className="size-4" strokeWidth={2.5} />
            Print
          </Button>
          <Button onClick={() => exportImage("download")}>
            <Download aria-hidden="true" className="size-4" strokeWidth={2.5} />
            Download PNG
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Draws the wall as a 1600px-wide poster. */
function renderWall(state: WallOfMomentsState): HTMLCanvasElement {
  const c = brandColors();
  const W = 1600;
  const cols = state.moments.length > 4 ? 3 : 2;
  const pad = 64;
  const gap = 28;
  const cardW = (W - pad * 2 - gap * (cols - 1)) / cols;
  const cardH = 230;
  const rows = Math.ceil(state.moments.length / cols);
  const H = 260 + rows * (cardH + gap) + 90;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = c.primary;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c.secondary;
  ctx.fillRect(0, 0, W, 14);

  ctx.fillStyle = c.onPrimary;
  ctx.font = bodyFont(800, 72);
  ctx.textBaseline = "top";
  ctx.fillText(`🏆 ${state.title}`, pad, 70);
  ctx.font = bodyFont(600, 28);
  ctx.globalAlpha = 0.8;
  ctx.fillText(
    `${state.moments.length} moment${state.moments.length === 1 ? "" : "s"} · Nexa Chess`,
    pad,
    168,
  );
  ctx.globalAlpha = 1;

  state.moments.forEach((m, i) => {
    const x = pad + (i % cols) * (cardW + gap);
    const y = 240 + Math.floor(i / cols) * (cardH + gap);
    ctx.fillStyle = c.surface;
    roundRect(ctx, x, y, cardW, cardH, 24);
    ctx.fill();
    ctx.fillStyle = c.text;
    ctx.font = bodyFont(400, 56);
    ctx.fillText(m.badge, x + 28, y + 24);
    ctx.font = bodyFont(800, 32);
    ctx.fillText(
      wrapText(ctx, m.title, cardW - 56, 1)[0] ?? "",
      x + 28,
      y + 96,
    );
    ctx.fillStyle = c.primary;
    ctx.font = bodyFont(700, 28);
    ctx.fillText(
      wrapText(ctx, m.studentName, cardW - 56, 1)[0] ?? "",
      x + 28,
      y + 138,
    );
    if (m.note) {
      ctx.fillStyle = c.muted;
      ctx.font = bodyFont(500, 22);
      wrapText(ctx, m.note, cardW - 56, 2).forEach((line, j) =>
        ctx.fillText(line, x + 28, y + 176 + j * 26),
      );
    }
  });

  ctx.fillStyle = c.onPrimary;
  ctx.globalAlpha = 0.7;
  ctx.font = bodyFont(600, 24);
  ctx.fillText("NexaGen · Nexa Chess Academy", pad, H - 64);
  ctx.globalAlpha = 1;
  return canvas;
}
