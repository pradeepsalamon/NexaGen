"use client";

import { useEffect, useState } from "react";
import { Info, Lock } from "lucide-react";
import {
  BOARD_THEME_CATALOG,
  chessAppearanceSchema,
  PIECE_SET_CATALOG,
  SOUND_THEME_CATALOG,
  type ChessAppearance,
  type ChessAppearanceOverride,
} from "@nexa-chess/types";
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
  useChessAppearanceAdminQuery,
  useResetChessAppearanceAdminMutation,
  useUpdateChessAppearanceAdminMutation,
} from "../hooks/useChessAppearanceApi";
import { Switch } from "@/components/ui/Switch";

const PREVIEW_FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

export function AdminChessAppearanceClient() {
  const { data, isLoading, isError, refetch } = useChessAppearanceAdminQuery();
  const updateMutation = useUpdateChessAppearanceAdminMutation();
  const resetMutation = useResetChessAppearanceAdminMutation();

  const [draft, setDraft] = useState<ChessAppearance>(() => chessAppearanceSchema.parse({}));
  const [disabledBoardThemeIds, setDisabledBoardThemeIds] = useState<string[]>([]);
  const [disabledPieceSetIds, setDisabledPieceSetIds] = useState<string[]>([]);
  const [disabledSoundThemeIds, setDisabledSoundThemeIds] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const [previewFen, setPreviewFen] = useState(PREVIEW_FEN);

  useEffect(() => {
    if (!data) return;
    setDraft(data.resolved);
    setDisabledBoardThemeIds(data.disabledBoardThemeIds);
    setDisabledPieceSetIds(data.disabledPieceSetIds);
    setDisabledSoundThemeIds(data.disabledSoundThemeIds);
    setLocked(data.locked);
  }, [data]);

  const patch = (p: Partial<ChessAppearance>) => setDraft((d) => ({ ...d, ...p }));

  const toggleDisabled = (list: string[], setList: (next: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const dirty = data
    ? JSON.stringify(draft) !== JSON.stringify(data.resolved) ||
      JSON.stringify([...disabledBoardThemeIds].sort()) !== JSON.stringify([...data.disabledBoardThemeIds].sort()) ||
      JSON.stringify([...disabledPieceSetIds].sort()) !== JSON.stringify([...data.disabledPieceSetIds].sort()) ||
      JSON.stringify([...disabledSoundThemeIds].sort()) !== JSON.stringify([...data.disabledSoundThemeIds].sort()) ||
      locked !== data.locked
    : false;

  const handleSave = () => {
    const settings: ChessAppearanceOverride = { ...draft };
    updateMutation.mutate({
      settings,
      disabledBoardThemeIds,
      disabledPieceSetIds,
      disabledSoundThemeIds,
      locked,
    });
  };

  const enabledBoardThemes = BOARD_THEME_CATALOG.filter((t) => !disabledBoardThemeIds.includes(t.id));
  const enabledPieceSets = PIECE_SET_CATALOG.filter((p) => !disabledPieceSetIds.includes(p.id));
  const enabledSoundThemes = SOUND_THEME_CATALOG.filter((s) => !disabledSoundThemeIds.includes(s.id));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-app-text">Chess appearance</h1>
        <p className="mt-1 text-sm text-app-muted">
          The platform-wide default board and piece set. Manage which built-in themes are available
          to everyone.
        </p>
      </div>

      {isLoading ? (
        <Card className="p-5 sm:p-6">
          <Skeleton className="h-96 w-full" />
        </Card>
      ) : isError || !data ? (
        <Card className="p-5 sm:p-6">
          <WidgetError message="Couldn't load the global board appearance." onRetry={() => refetch()} />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <div className="flex items-start gap-2.5 rounded-app border border-app-border bg-[color-mix(in_srgb,var(--color-primary)_6%,var(--color-surface))] p-3.5 text-sm text-app-text">
              <Info className="mt-0.5 size-4 shrink-0 text-primary-ink" strokeWidth={2.5} />
              <p>
                This changes the default appearance for users who have not selected a personal board
                preference. Users with their own preference are unaffected.
              </p>
            </div>

            <Card className="space-y-1 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-2.5">
                  <Lock className="mt-0.5 size-4 shrink-0 text-app-muted" strokeWidth={2.5} />
                  <div>
                    <h2 className="text-lg font-bold text-app-text">Lock board settings</h2>
                    <p className="mt-1 text-sm text-app-muted">
                      When on, every coach and student sees this default and can&apos;t set a
                      personal board/piece/sound preference of their own — you&apos;re the only
                      one who controls it.
                    </p>
                  </div>
                </div>
                <Switch
                  id="chess-appearance-locked"
                  checked={locked}
                  onCheckedChange={(c) => setLocked(c === true)}
                  aria-label="Lock board settings for everyone"
                />
              </div>
            </Card>

            <Card className="space-y-3 p-5 sm:p-6">
              <h2 className="text-lg font-bold text-app-text">Global default board</h2>
              <BoardThemePicker
                themes={enabledBoardThemes}
                pieceSetId={draft.pieceSetId}
                selectedId={draft.boardThemeId}
                onSelect={(boardThemeId) => patch({ boardThemeId })}
              />
            </Card>

            <Card className="space-y-3 p-5 sm:p-6">
              <h2 className="text-lg font-bold text-app-text">Global default pieces</h2>
              <PieceSetPicker
                pieceSets={enabledPieceSets}
                boardThemeId={draft.boardThemeId}
                selectedId={draft.pieceSetId}
                onSelect={(pieceSetId) => patch({ pieceSetId })}
              />
              <PieceColorPicker draft={draft} onChange={patch} />
            </Card>

            <Card className="space-y-3 p-5 sm:p-6">
              <h2 className="text-lg font-bold text-app-text">Global default sound</h2>
              <SoundThemePicker
                soundThemes={enabledSoundThemes}
                selectedId={draft.soundThemeId}
                onSelect={(soundThemeId) => patch({ soundThemeId })}
              />
              <SoundSettingsForm draft={draft} onChange={patch} />
            </Card>

            <Card className="space-y-3 p-5 sm:p-6">
              <h2 className="text-lg font-bold text-app-text">Default behavior</h2>
              <AppearanceTogglesForm draft={draft} onChange={patch} />
            </Card>

            <Card className="space-y-4 p-5 sm:p-6">
              <div>
                <h2 className="text-lg font-bold text-app-text">Built-in themes</h2>
                <p className="mt-1 text-sm text-app-muted">
                  Disable a theme to hide it from every picker. System themes can&apos;t be deleted,
                  only turned off.
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-app-muted">Board themes</p>
                  {BOARD_THEME_CATALOG.map((theme) => (
                    <Switch
                      key={theme.id}
                      id={`board-theme-enabled-${theme.id}`}
                      label={theme.name}
                      checked={!disabledBoardThemeIds.includes(theme.id)}
                      onCheckedChange={() =>
                        toggleDisabled(disabledBoardThemeIds, setDisabledBoardThemeIds, theme.id)
                      }
                    />
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-bold text-app-muted">Piece sets</p>
                  {PIECE_SET_CATALOG.map((set) => (
                    <Switch
                      key={set.id}
                      id={`piece-set-enabled-${set.id}`}
                      label={set.name}
                      checked={!disabledPieceSetIds.includes(set.id)}
                      onCheckedChange={() =>
                        toggleDisabled(disabledPieceSetIds, setDisabledPieceSetIds, set.id)
                      }
                    />
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-bold text-app-muted">Sound themes</p>
                  {SOUND_THEME_CATALOG.map((theme) => (
                    <Switch
                      key={theme.id}
                      id={`sound-theme-enabled-${theme.id}`}
                      label={theme.name}
                      checked={!disabledSoundThemeIds.includes(theme.id)}
                      onCheckedChange={() =>
                        toggleDisabled(disabledSoundThemeIds, setDisabledSoundThemeIds, theme.id)
                      }
                    />
                  ))}
                </div>
              </div>
            </Card>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
              >
                Reset to Nexa Classic
              </Button>
              <Button type="button" onClick={handleSave} disabled={updateMutation.isPending || !dirty}>
                {updateMutation.isPending ? "Saving…" : "Save global default"}
              </Button>
            </div>
          </div>

          <div className="lg:sticky lg:top-20 lg:self-start">
            <Card className="space-y-3 p-5">
              <h2 className="text-sm font-bold text-app-muted">Live preview</h2>
              <ChessAppearancePreviewScope config={draft}>
                <PracticeBoard fen={previewFen} onMove={(m) => setPreviewFen(m.fen)} className="mx-auto max-w-none" />
              </ChessAppearancePreviewScope>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
