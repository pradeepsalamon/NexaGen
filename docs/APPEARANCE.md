# Chess board appearance & typography

> Moved out of [CLAUDE.md](../CLAUDE.md) on 2026-10-17 to keep that file
> under the context limit; the text is unchanged. `§` numbers refer to
> CLAUDE.md, which keeps a short summary under the same number.

## 3.6h Chess board appearance

`apps/api/src/chess-appearance/` + `apps/web/src/features/chess-appearance/`,
pages `/chess-board` (any role, personal preference) and
`/admin/chess-appearance` (admin, global default), routes
`API_ROUTES.chessAppearance.*`. Centralizes the visual appearance of every
chessboard in the app — board theme, piece set, coordinates, animation,
highlight/legal-move/check toggles — behind one resolver, so no board
component hardcodes its own styling.

- **Same 3-layer resolver shape as pre-class settings** (§3.7's
  `resolveLiveClassSettings`): system default (Nexa Classic) → admin global
  default (`ChessAppearanceSettings` singleton) → the caller's own
  `UserChessAppearancePreference` row, last non-empty layer wins.
  `resolveChessAppearance` + `BOARD_THEME_CATALOG` / `PIECE_SET_CATALOG` live
  in `@nexa-chess/types` (`chess-appearance.ts`) — use them, don't reimplement.
- **A preference save merges onto the caller's existing stored override**,
  never replaces it wholesale (`mergeChessAppearanceOverrides`). A
  single-field patch — the live board's `C` keyboard shortcut for
  coordinates, say — must not silently erase a different field the user set
  from the settings page. Applies to both the user and admin update paths.
- **Board themes are self-authored CSS**, not images: a checkerboard from two
  stacked `linear-gradient`s plus an optional wood-grain layer, parameterized
  by `--nexa-*` CSS custom properties scoped under
  `[data-nexa-board-theme="<id>"]` (`features/chess-appearance/styles/boards.css`).
  Lichess's own board textures are photographic with no documented license,
  and a screenshot/photo background is explicitly ruled out — real interactive
  squares only. Coordinates are drawn inside the edge squares, lichess-style
  (ranks top-right of the right column, files bottom-left of the bottom row),
  each in the opposite square's `--nexa-light`/`--nexa-dark` colour — so a new
  theme needs no coordinate colour of its own.
- **Piece sets are vendored SVGs from lichess's open-source piece library**
  (github.com/lichess-org/lila), filtered to commercially-safe licenses —
  most lichess sets are CC BY-NC-SA (non-commercial) and were excluded.
  Attribution: `apps/web/public/chess/pieces/LICENSES.md`. Scoped the same
  way, under `[data-nexa-piece-set="<id>"]`
  (`features/chess-appearance/styles/pieces.css`), referenced by file URL
  (not inlined) so the browser only fetches a set once it actually renders.
- **Every chessboard reads from `useChessAppearance()`**
  (`ChessAppearanceProvider`, mounted once in `AppProviders.tsx`;
  CSS imported once via `features/chess-appearance/styles/index.css`), not
  hardcoded values: `ChessgroundBoard`, `PracticeBoard`, `PositionEditor`,
  `PuzzleBoardTile`, `PgnBoardViewer`, `SolutionEditor` (via `PracticeBoard`),
  and the recorder template (`RecorderClient`, which has no authenticated
  user, so always resolves to the system/admin default). **Purely cosmetic**:
  never affects FEN/position/moves/puzzle solution/game state, and — like
  board theme picks generally — is deliberately **not** synced over any
  `LIVE_CLASS_*` data-channel topic, so each participant keeps their own
  appearance independent of the coach's.
- **`ChessAppearancePreviewScope`** shadows the app-wide context with draft
  values for its subtree, so a settings page's live preview (a real, movable
  `PracticeBoard`) updates immediately as the form changes, with no special
  "preview mode" plumbing in any board component.
- **Disabling a built-in theme is the only lifecycle action** — admin can
  never delete one (`ChessAppearanceSettings.disabledBoardThemeIds` /
  `.disabledPieceSetIds`). A disabled theme disappears from both picker UIs;
  a user who already had it selected keeps rendering it unchanged.
- `ChessAppearanceSettings` and `UserChessAppearancePreference` are **not
  soft-deletable** and not Trash-registered — cosmetic, not an audit-worthy
  record.
- Built-in catalogue: board themes Nexa Classic, Classic Green, Blue, Brown,
  Dark, Minimal; piece sets Classic, Modern, Minimal, Tournament, Wooden.

## 3.6j Fonts & text size (typography)

`apps/api/src/typography/` + `apps/web/src/features/typography/`, pages
`/admin/typography` (admin, platform default) and the "Text & fonts" section on
`/profile` (any role, personal), routes `API_ROUTES.typography.*`.

- **Same 3-layer resolver as chess appearance** (§3.6h): system default
  (Outfit headings + Nunito Sans body, "Default" size) → admin
  `TypographySettings` singleton → the caller's `UserTypographyPreference`.
  `locked` on the singleton skips the user layer and refuses personal saves.
  `resolveTypography`, `mergeTypographyOverrides`, `FONT_CATALOG` and
  `TEXT_SCALE_FACTORS` live in `@nexa-chess/types` (`typography.ts`).
- **Fonts are OFL Google Fonts, self-hosted** (`src/assets/fonts/`, latin +
  latin-ext) and loaded by `next/font/local` — **never `next/font/google`**: it
  downloads at build time, and a Google response with an extension-less font URL
  crashed CI (`Cannot read properties of null (reading '1')`). The loaders are
  generated by `apps/web/scripts/vendor-google-fonts.mjs` into
  `app/fonts.generated.ts` (+ `app/academy/fonts.generated.ts` for the marketing
  site's Inter/Playfair): one loader per font per subset, each with Google's
  `unicode-range`. `app/fonts.ts` joins them into `--font-<id>` (latin last — it
  carries the metric-matched fallback face) in a `<style>` in the root layout.
  Only the two defaults preload. **Adding a font = add it to `fontIdSchema` +
  `FONT_CATALOG` AND to `FONTS`/`GROUPS` in the vendor script, then re-run it
  and commit the files** — the id is the CSS variable suffix, so the two must
  match.
- **Applied by repointing CSS variables, not by component props.**
  `--font-heading` / `--font-body` / `--text-scale` on `<html>`;
  `--font-sans` (Tailwind `font-sans`, the body default) and `--font-display`
  (`font-display` utility, every `h1`–`h6`) derive from them, and
  `html { font-size: calc(100% * var(--text-scale)) }` scales every rem size.
  Arbitrary `text-[13px]` values do **not** scale — prefer rem-based sizes.
  `TypographySync` (in `AppProviders`) applies the resolved config and caches it
  in `localStorage` `nexa-typography`, which the pre-paint script in
  `app/layout.tsx` reads so there is no font flash on reload.
- Neither model is soft-deletable or Trash-registered (cosmetic).
