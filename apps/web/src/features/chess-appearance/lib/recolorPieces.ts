/**
 * Custom white/black piece colors (spec: "change both piece colors").
 *
 * Piece art renders via chessground's own CSS mechanism — `piece.<role>.<color>
 * { background-image: url("/chess/pieces/<set>/<file>.svg") }` in `pieces.css`
 * — a *file reference*. A CSS custom property set on the host page cannot
 * reach into that separately-fetched SVG document to recolor it; the only way
 * to actually change what renders is to build a *new* image: fetch the vendored
 * SVG's source text, transform its color, and point `background-image` at the
 * transformed copy instead (a `data:` URI, so no upload/storage is involved).
 *
 * Two transforms, both non-destructive of outline/detail work:
 *  1. Explicit near-white/near-black literal fills (`fill="#fff"`,
 *     `fill:#000004`, etc.) are swapped for the chosen color.
 *  2. A `<g fill="<color>">` wrapper is added around the whole document, so
 *     any path that relies on SVG's implicit "no fill = black" default (a
 *     shortcut several vendored sets use for their black pieces — no `#000`
 *     literal ever appears in the file to find-and-replace) inherits the
 *     chosen color instead. An element with its own explicit fill (an
 *     outline, an accent highlight) is unaffected — explicit always wins over
 *     inherited.
 *
 * This reliably recolors `classic`, `modern` and `bold` (verified against
 * their actual SVG source). It does NOT reliably work for every vendored set:
 * `tournament` draws its silhouette from one dark literal color shared by
 * both sides with a separate gradient overlay for white, `minimal` and
 * `wooden` build their look from multi-stop gradients / multiple flat tones
 * rather than one recolorable body fill — a blind swap on those would produce
 * a broken-looking piece, not a recolored one. `RECOLOR_SUPPORTED_PIECE_SETS`
 * is the allowlist; the UI hides the color picker for anything else.
 */

export const RECOLOR_SUPPORTED_PIECE_SETS: ReadonlySet<string> = new Set([
  "classic",
  "modern",
  "bold",
]);

export function pieceSetSupportsCustomColors(pieceSetId: string): boolean {
  return RECOLOR_SUPPORTED_PIECE_SETS.has(pieceSetId);
}

const WHITE_FILL_RE = /#fff(?:fff)?\b/gi;
// A couple of vendored sets export "black" a hair off pure black
// (e.g. mpchess's `#000004`) rather than `#000`/`#000000` exactly.
const BLACK_FILL_RE = /#(?:000(?:000)?|00000[0-9a-f])\b/gi;

const PIECE_FILES = ["P", "N", "B", "R", "Q", "K"] as const;
const ROLE_CLASS: Record<(typeof PIECE_FILES)[number], string> = {
  P: "pawn",
  N: "knight",
  B: "bishop",
  R: "rook",
  Q: "queen",
  K: "king",
};

// Raw SVG text rarely changes and is shared across every color choice for a
// given piece set, so it's cached independently of the recolored result.
const svgTextCache = new Map<string, Promise<string>>();

function fetchSvgText(pieceSetId: string, fileName: string): Promise<string> {
  const key = `${pieceSetId}/${fileName}`;
  let pending = svgTextCache.get(key);
  if (!pending) {
    pending = fetch(`/chess/pieces/${pieceSetId}/${fileName}.svg`).then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${key}.svg`);
      return res.text();
    });
    svgTextCache.set(key, pending);
  }
  return pending;
}

function recolorSvg(svg: string, literalRe: RegExp, color: string): string {
  const withLiteralsSwapped = svg.replace(literalRe, color);
  // Wrap so anything relying on the implicit "no fill = black" default picks
  // up the chosen color too; an element with its own explicit fill still wins.
  return withLiteralsSwapped
    .replace(/(<svg[^>]*>)/, `$1<g fill="${color}">`)
    .replace(/(<\/svg>)/, `</g>$1`);
}

function toDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// The full recolored stylesheet is cached per (piece set, white, black) combo
// so re-selecting a previous combination (e.g. undoing a color change) is free.
const cssCache = new Map<string, Promise<string>>();

/**
 * Builds the CSS overriding one piece set's `background-image` rules with
 * recolored copies, scoped to `[data-nexa-piece-set="<id>"][data-nexa-piece-recolor="on"]`
 * — board components only carry that second attribute while a custom color is
 * actually set (see `useChessAppearance().hasCustomPieceColors`), so this
 * never affects a piece-set picker preview or any board using default colors.
 *
 * Returns `null` when neither color is set, or the piece set isn't in
 * `RECOLOR_SUPPORTED_PIECE_SETS`.
 */
export function buildRecoloredPieceCss(
  pieceSetId: string,
  whiteColor: string | null | undefined,
  blackColor: string | null | undefined,
): Promise<string | null> {
  if ((!whiteColor && !blackColor) || !pieceSetSupportsCustomColors(pieceSetId)) {
    return Promise.resolve(null);
  }

  const cacheKey = `${pieceSetId}|${whiteColor ?? ""}|${blackColor ?? ""}`;
  let pending = cssCache.get(cacheKey);
  if (pending) return pending;

  pending = (async () => {
    const rules: string[] = [];
    await Promise.all(
      (["w", "b"] as const).map(async (side) => {
        const color = side === "w" ? whiteColor : blackColor;
        if (!color) return;
        const literalRe = side === "w" ? WHITE_FILL_RE : BLACK_FILL_RE;
        const colorClass = side === "w" ? "white" : "black";
        await Promise.all(
          PIECE_FILES.map(async (piece) => {
            const fileName = `${side}${piece}`;
            const svg = await fetchSvgText(pieceSetId, fileName);
            const recolored = recolorSvg(svg, literalRe, color);
            const selector = `[data-nexa-piece-set="${pieceSetId}"][data-nexa-piece-recolor="on"] piece.${ROLE_CLASS[piece]}.${colorClass}`;
            rules.push(`${selector} { background-image: url("${toDataUri(recolored)}"); }`);
          }),
        );
      }),
    );
    return rules.join("\n");
  })();

  cssCache.set(cacheKey, pending);
  return pending;
}
