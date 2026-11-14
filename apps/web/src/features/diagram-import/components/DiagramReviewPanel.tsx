"use client";

import { useMemo, useState, type ReactNode } from "react";
import { possibleCastlingFlags, DIAGRAM_CANDIDATE_STATUS_LABELS, type DiagramOrientation } from "@nexa-chess/types";
import { CheckCircle2, Copy, Repeat2, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { PositionEditor } from "@/features/chessboard/components/board/PositionEditor";
import { parseFen } from "@/features/chessboard/lib/fen";
import { useToast } from "@/providers/ToastProvider";
import {
  assessReview,
  doubtfulSquareNames,
  initialReview,
  recognizedPlacement,
  rotatePlacement,
  type CandidateReview,
  type CastlingRights,
  type DiagramCandidate,
} from "../lib/candidates";
import { statusBadgeVariant } from "./statusBadge";

type Props = {
  candidate: DiagramCandidate;
  review: CandidateReview;
  onChange: (next: CandidateReview) => void;
  onDiscard: () => void;
  /** What a confirmed position can be used for (load / save). */
  actions: (fen: string, corrected: boolean) => ReactNode;
};

const CASTLING_LABELS: { key: keyof CastlingRights; label: string }[] = [
  { key: "K", label: "White O-O" },
  { key: "Q", label: "White O-O-O" },
  { key: "k", label: "Black O-O" },
  { key: "q", label: "Black O-O-O" },
];

export function DiagramReviewPanel({ candidate, review, onChange, onDiscard, actions }: Props) {
  const toast = useToast();
  const [flipView, setFlipView] = useState(false);
  const assessment = useMemo(() => assessReview(candidate, review), [candidate, review]);
  const possible = possibleCastlingFlags(review.placement);
  const anyCastlingPossible = possible.K || possible.Q || possible.k || possible.q;
  const doubtful = doubtfulSquareNames(candidate, review.orientation);
  const editorOrientation: DiagramOrientation =
    flipView ? (review.orientation === "white" ? "black" : "white") : review.orientation;

  // Any edit withdraws an earlier confirmation: the coach confirms what they see.
  const update = (patch: Partial<CandidateReview>) => onChange({ ...review, ...patch, confirmed: false });

  const setOrientation = (orientation: DiagramOrientation) => {
    if (orientation === review.orientation) {
      update({ orientationConfirmed: true });
      return;
    }
    // The whole reading rotates, edits included — the board keeps matching the source picture.
    update({ orientation, orientationConfirmed: true, placement: rotatePlacement(review.placement) });
  };

  const onEditorChange = (fen: string) => {
    const { placement } = parseFen(fen);
    if (placement !== review.placement) {
      const stillPossible = possibleCastlingFlags(placement);
      const castling = {
        K: review.castling.K && stillPossible.K,
        Q: review.castling.Q && stillPossible.Q,
        k: review.castling.k && stillPossible.k,
        q: review.castling.q && stillPossible.q,
      };
      const nowAny = stillPossible.K || stillPossible.Q || stillPossible.k || stillPossible.q;
      update({
        placement,
        castling,
        // Castling can't be in question any more once no king and rook are at home.
        castlingMode: nowAny ? review.castlingMode : "none",
        warningsAccepted: false,
      });
    }
  };

  const copyFen = async () => {
    try {
      await navigator.clipboard.writeText(assessment.fen);
      toast.success({ title: "FEN copied" });
    } catch {
      toast.error({ title: "Could not copy — select the FEN and copy it by hand." });
    }
  };

  const canConfirm = assessment.status === "valid";

  return (
    <div className="flex flex-col gap-5" data-testid="diagram-review">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-app-text">
            Page {candidate.page} · Diagram {candidate.index}
            {candidate.origin === "manual" ? " (marked by hand)" : ""}
          </h2>
          <p className="text-sm text-app-muted">
            Recognition confidence {Math.round(candidate.meanConfidence * 100)}% — compare every square with the source before confirming.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge data-testid="diagram-status" variant={statusBadgeVariant(assessment.status)}>
            {DIAGRAM_CANDIDATE_STATUS_LABELS[assessment.status]}
          </Badge>
          <SimpleTooltip label="Discard this diagram">
            <Button aria-label="Discard this diagram" onClick={onDiscard} size="icon" variant="outline">
              <Trash2 className="size-4" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <figure className="flex flex-col gap-2">
          <figcaption className="text-sm font-semibold text-app-text">Source diagram</figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element -- an in-memory data URL, never a network image */}
          <img
            alt={`Diagram ${candidate.index} as printed on page ${candidate.page}`}
            className="w-full max-w-[360px] rounded-control border border-app-border bg-app-surface"
            src={candidate.crop}
          />
          {candidate.annotated ? (
            <Alert data-testid="diagram-annotated" title="This diagram has arrows or lines on it" variant="warning">
              Marks drawn over a board can read as pieces, so check every square.
            </Alert>
          ) : null}
          {doubtful.length > 0 ? (
            <Alert title="Check these squares" variant="warning">
              The recognizer was unsure about {doubtful.join(", ")}.
            </Alert>
          ) : null}
        </figure>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-app-text">Recognized position — drag pieces to correct it</span>
            <div className="flex gap-2">
              <Button onClick={() => setFlipView((v) => !v)} size="sm" type="button" variant="outline">
                <Repeat2 className="size-3.5" strokeWidth={2.5} />
                Flip view
              </Button>
              <Button
                disabled={!assessment.corrected}
                onClick={() => update({ placement: recognizedPlacement(candidate, review.orientation) })}
                size="sm"
                type="button"
                variant="outline"
              >
                <RotateCcw className="size-3.5" strokeWidth={2.5} />
                Reset
              </Button>
            </div>
          </div>
          <PositionEditor
            onChange={onEditorChange}
            orientation={editorOrientation}
            showDetails={false}
            value={`${review.placement} w - - 0 1`}
          />
        </div>
      </div>

      <section aria-labelledby="diagram-details" className="flex flex-col gap-4 rounded-app border border-app-border bg-app-surface p-4">
        <div>
          <h3 className="text-base font-bold text-app-text" id="diagram-details">
            What the diagram doesn&apos;t say
          </h3>
          <p className="text-sm text-app-muted">
            A diagram shows the pieces only. Nothing below is assumed — answer each question.
          </p>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-semibold text-app-text">Which side is at the bottom of the diagram?</legend>
          <RadioRow
            name={`orientation-${candidate.id}`}
            onSelect={(v) => setOrientation(v as DiagramOrientation)}
            options={[
              { label: "White", value: "white" },
              { label: "Black", value: "black" },
            ]}
            value={review.orientationConfirmed ? review.orientation : null}
          />
          <FieldNote
            ok={review.orientationConfirmed}
            text={
              candidate.orientation.source === "coordinates"
                ? "Read from the printed coordinates."
                : candidate.orientation.source === "pieces"
                  ? `Suggested from the pawns: ${candidate.orientation.orientation === "white" ? "White" : "Black"} at the bottom — please confirm.`
                  : "No coordinates or clear pawn structure — please choose."
            }
          />
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-semibold text-app-text">Side to move</legend>
          <RadioRow
            name={`side-${candidate.id}`}
            onSelect={(v) => update({ sideToMove: v as "w" | "b", sideSource: "coach", warningsAccepted: false })}
            options={[
              { label: "White", value: "w" },
              { label: "Black", value: "b" },
            ]}
            value={review.sideToMove}
          />
          <FieldNote
            ok={!!review.sideToMove}
            text={
              review.sideSource === "caption" && candidate.sideHint
                ? `${candidate.textSource === "ocr" ? "Read from the picture" : "From the caption"}: "${candidate.sideHint.phrase}".`
                : review.sideToMove
                  ? "Chosen by you."
                  : "Not shown in the diagram — choose one."
            }
          />
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-semibold text-app-text">Castling rights</legend>
          {anyCastlingPossible ? (
            <>
              <RadioRow
                name={`castling-${candidate.id}`}
                onSelect={(v) => update({ castlingMode: v as "none" | "choose", warningsAccepted: false })}
                options={[
                  { label: "None", value: "none" },
                  { label: "Choose", value: "choose" },
                ]}
                value={review.castlingMode}
              />
              {review.castlingMode === "choose" ? (
                <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
                  {CASTLING_LABELS.map(({ key, label }) => (
                    <Checkbox
                      checked={possible[key] && review.castling[key]}
                      disabled={!possible[key]}
                      id={`castle-${candidate.id}-${key}`}
                      key={key}
                      label={label}
                      onCheckedChange={(c) =>
                        update({ castling: { ...review.castling, [key]: c === true }, warningsAccepted: false })
                      }
                    />
                  ))}
                </div>
              ) : null}
              <FieldNote
                ok={review.castlingMode !== null}
                text="A diagram can't show whether the king or rooks have moved. Only squares with king and rook at home can be ticked."
              />
            </>
          ) : (
            <FieldNote ok text="None possible — no king and rook stand on their home squares." />
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-app-text">En passant and move number</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-sm text-app-text">
              En-passant square
              <Input
                aria-label="En-passant square"
                className="min-h-9 w-20 px-3 font-mono"
                maxLength={2}
                onChange={(e) => update({ enPassant: e.target.value.trim() || "-", countersAccepted: false })}
                value={review.enPassant}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-app-text">
              Move number
              <Input
                aria-label="Move number"
                className="min-h-9 w-24 px-3"
                min={1}
                onChange={(e) =>
                  update({ fullMove: String(Math.max(1, parseInt(e.target.value, 10) || 1)), countersAccepted: false })
                }
                type="number"
                value={review.fullMove}
              />
            </label>
          </div>
          <Checkbox
            checked={review.countersAccepted}
            id={`counters-${candidate.id}`}
            label={`Use these: en passant ${review.enPassant === "-" ? "none" : review.enPassant}, move ${review.fullMove}, halfmove clock ${review.halfMove} (not shown in the diagram)`}
            onCheckedChange={(c) => update({ countersAccepted: c === true })}
          />
        </fieldset>
      </section>

      {assessment.errors.length > 0 ? (
        <Alert title="This position can't be used yet" variant="error">
          <ul className="list-disc pl-4">
            {assessment.errors.map((e) => (
              <li key={`${e.code}-${e.message}`}>{e.message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {assessment.warnings.length > 0 ? (
        <Alert title="Worth a second look" variant="warning">
          <ul className="list-disc pl-4">
            {assessment.warnings.map((w) => (
              <li key={`${w.code}-${w.message}`}>{w.message}</li>
            ))}
          </ul>
          <div className="mt-1">
            <Checkbox
              checked={review.warningsAccepted}
              id={`warnings-${candidate.id}`}
              label="I've checked — this position is intended"
              onCheckedChange={(c) => update({ warningsAccepted: c === true })}
            />
          </div>
        </Alert>
      ) : null}

      <label className="flex flex-col gap-1 text-sm font-semibold text-app-text">
        FEN preview
        <div className="flex gap-2">
          <Input className="min-h-9 font-mono font-normal" data-testid="diagram-fen" readOnly value={assessment.fen} />
          <SimpleTooltip label="Copy FEN">
            <Button aria-label="Copy FEN" onClick={copyFen} size="icon" type="button" variant="outline">
              <Copy className="size-4" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
        </div>
        {!review.sideToMove ? <span className="text-xs font-normal text-app-muted">Shown with White to move until you choose.</span> : null}
      </label>

      {review.confirmed && assessment.status === "confirmed" ? (
        <div className="flex flex-col gap-3">
          <Alert title="Confirmed by you" variant="success">
            {assessment.corrected ? "You corrected the recognized position. " : ""}
            Choose what to do with it.
          </Alert>
          <div className="flex flex-wrap justify-end gap-2">{actions(assessment.fen, assessment.corrected)}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {assessment.pending.length > 0 && assessment.errors.length === 0 ? (
            <ul className="list-disc pl-5 text-sm text-app-muted" data-testid="diagram-pending">
              {assessment.pending.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => onChange(initialReview(candidate))} type="button" variant="outline">
              Start over
            </Button>
            <Button disabled={!canConfirm} onClick={() => onChange({ ...review, confirmed: true })} type="button">
              <ShieldCheck className="size-4" strokeWidth={2.5} />
              Confirm position
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RadioRow({
  name,
  onSelect,
  options,
  value,
}: {
  name: string;
  onSelect: (value: string) => void;
  options: { label: string; value: string }[];
  value: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-4 text-sm text-app-text">
      {options.map((o) => (
        <label className="flex min-h-10 cursor-pointer items-center gap-2" key={o.value}>
          <input
            checked={value === o.value}
            className="size-4 accent-primary"
            name={name}
            onChange={() => onSelect(o.value)}
            type="radio"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function FieldNote({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p className={ok ? "flex items-center gap-1.5 text-xs text-success-ink" : "text-xs text-warning-ink"}>
      {ok ? <CheckCircle2 aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} /> : null}
      {text}
    </p>
  );
}
