"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { DEFAULT_CHESS_APPEARANCE, type ChessAppearance } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import { AppearanceTogglesForm } from "./AppearanceTogglesForm";
import { BoardThemePicker } from "./BoardThemePicker";
import { ChessAppearancePreviewScope } from "./ChessAppearancePreviewScope";
import { PieceColorPicker } from "./PieceColorPicker";
import { PieceSetPicker } from "./PieceSetPicker";
import { SoundSettingsForm } from "./SoundSettingsForm";
import { SoundThemePicker } from "./SoundThemePicker";
import {
  useChessAppearanceCatalogQuery,
  useResetChessAppearanceMutation,
  useResolvedChessAppearanceQuery,
  useUpdateChessAppearanceMutation,
} from "../hooks/useChessAppearanceApi";

const PREVIEW_FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

function sourceLabel(source: "user" | "admin-default" | "system-default") {
  switch (source) {
    case "user":
      return "Your personal preference";
    case "admin-default":
      return "The platform's default";
    case "system-default":
      return "Nexa Classic (built-in default)";
  }
}

export function UserChessAppearanceSettingsClient() {
  const { data: resolved, isLoading: loadingResolved, isError, refetch } = useResolvedChessAppearanceQuery();
  const { data: catalog, isLoading: loadingCatalog } = useChessAppearanceCatalogQuery();
  const updateMutation = useUpdateChessAppearanceMutation();
  const resetMutation = useResetChessAppearanceMutation();

  const [draft, setDraft] = useState<ChessAppearance>(DEFAULT_CHESS_APPEARANCE);
  const [previewFen, setPreviewFen] = useState(PREVIEW_FEN);

  useEffect(() => {
    if (resolved) setDraft(resolved.config);
  }, [resolved]);

  const patch = (p: Partial<ChessAppearance>) => setDraft((d) => ({ ...d, ...p }));

  const dirty = resolved ? JSON.stringify(draft) !== JSON.stringify(resolved.config) : false;
  const hasOwnPreference = resolved?.source === "user";
  const isLoading = loadingResolved || loadingCatalog;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-app-text">Chess board</h1>
        <p className="mt-1 text-sm text-app-muted">
          Choose how every chessboard looks for you — puzzles, practice, live classes and game
          review all use this same appearance.
        </p>
      </div>

      {isLoading ? (
        <Card className="p-5 sm:p-6">
          <Skeleton className="h-96 w-full" />
        </Card>
      ) : isError || !resolved || !catalog ? (
        <Card className="p-5 sm:p-6">
          <WidgetError message="Couldn't load your board appearance." onRetry={() => refetch()} />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            {resolved.locked && (
              <div className="flex items-start gap-2.5 rounded-app border border-app-border bg-[color-mix(in_srgb,var(--color-primary)_6%,var(--color-surface))] p-3.5 text-sm text-app-text">
                <Lock className="mt-0.5 size-4 shrink-0 text-primary-ink" strokeWidth={2.5} />
                <p>
                  Your administrator has locked board settings for everyone — you&apos;re seeing
                  the platform default and can&apos;t set a personal preference right now.
                </p>
              </div>
            )}

            <fieldset disabled={resolved.locked} className="space-y-5">
              <Card className="space-y-3 p-5 sm:p-6">
                <h2 className="text-lg font-bold text-app-text">Board</h2>
                <BoardThemePicker
                  themes={catalog.boardThemes}
                  pieceSetId={draft.pieceSetId}
                  selectedId={draft.boardThemeId}
                  onSelect={(boardThemeId) => patch({ boardThemeId })}
                />
              </Card>

              <Card className="space-y-3 p-5 sm:p-6">
                <h2 className="text-lg font-bold text-app-text">Pieces</h2>
                <PieceSetPicker
                  pieceSets={catalog.pieceSets}
                  boardThemeId={draft.boardThemeId}
                  selectedId={draft.pieceSetId}
                  onSelect={(pieceSetId) => patch({ pieceSetId })}
                />
                <PieceColorPicker draft={draft} onChange={patch} />
              </Card>

              <Card className="space-y-3 p-5 sm:p-6">
                <h2 className="text-lg font-bold text-app-text">Sound</h2>
                <SoundThemePicker
                  soundThemes={catalog.soundThemes}
                  selectedId={draft.soundThemeId}
                  onSelect={(soundThemeId) => patch({ soundThemeId })}
                />
                <SoundSettingsForm draft={draft} onChange={patch} />
              </Card>

              <Card className="space-y-3 p-5 sm:p-6">
                <h2 className="text-lg font-bold text-app-text">Board behavior</h2>
                <AppearanceTogglesForm draft={draft} onChange={patch} />
              </Card>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-app-muted">
                  Currently showing: <span className="font-semibold">{sourceLabel(resolved.source)}</span>
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => resetMutation.mutate()}
                    disabled={resetMutation.isPending || !hasOwnPreference}
                  >
                    Reset to default
                  </Button>
                  <Button
                    type="button"
                    onClick={() => updateMutation.mutate({ settings: draft })}
                    disabled={updateMutation.isPending || !dirty}
                  >
                    {updateMutation.isPending ? "Saving…" : "Save preferences"}
                  </Button>
                </div>
              </div>
            </fieldset>
          </div>

          <div className="lg:sticky lg:top-20 lg:self-start">
            <Card className="space-y-3 p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-app-muted">Live preview</h2>
              <ChessAppearancePreviewScope config={draft}>
                <PracticeBoard fen={previewFen} onMove={(m) => setPreviewFen(m.fen)} className="mx-auto max-w-none" />
              </ChessAppearancePreviewScope>
              <p className="text-xs text-app-muted">
                Try moving a piece — this preview reflects your unsaved changes immediately.
              </p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
