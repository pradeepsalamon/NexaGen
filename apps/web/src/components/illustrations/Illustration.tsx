import { cn } from "@/lib/utils";
import { Piece, type PieceShape } from "./pieces";

/**
 * NexaChess spot illustrations: one family — a soft disc, a small isometric
 * board, a piece and one accent that carries the meaning. Every colour is a
 * theme token (`fill-primary`, `fill-accent` …), so each one reads in light and
 * dark without a second asset. See docs/UI_RULES.md § "Visual enrichment".
 *
 * Add a scene here instead of drawing a one-off SVG in a feature.
 */
export type IllustrationName =
  | "achievement"
  | "courses"
  | "empty"
  | "error"
  | "liveClass"
  | "noResults"
  | "puzzles"
  | "schedule"
  | "students"
  | "success"
  | "welcome";

type Accent =
  | "book"
  | "broadcast"
  | "calendar"
  | "check"
  | "alert"
  | "magnifier"
  | "sparkles"
  | "star"
  | "target";

type Scene = {
  accent: Accent;
  piece: PieceShape;
  /** Fill of the main piece. */
  pieceClass: string;
  /** A second, smaller piece beside the first. */
  companion?: PieceShape;
};

const SCENES: Record<IllustrationName, Scene> = {
  achievement: { accent: "star", piece: "queen", pieceClass: "fill-accent stroke-accent-ink" },
  courses: { accent: "book", piece: "rook", pieceClass: "fill-primary stroke-primary-ink" },
  empty: { accent: "sparkles", piece: "pawn", pieceClass: "fill-primary stroke-primary-ink" },
  error: { accent: "alert", piece: "pawn", pieceClass: "fill-app-subtle stroke-app-muted" },
  liveClass: { accent: "broadcast", piece: "king", pieceClass: "fill-primary stroke-primary-ink" },
  noResults: { accent: "magnifier", piece: "pawn", pieceClass: "fill-primary stroke-primary-ink" },
  puzzles: { accent: "target", piece: "knight", pieceClass: "fill-primary stroke-primary-ink" },
  schedule: { accent: "calendar", piece: "rook", pieceClass: "fill-primary stroke-primary-ink" },
  students: { accent: "sparkles", companion: "pawn", piece: "pawn", pieceClass: "fill-primary stroke-primary-ink" },
  success: { accent: "check", piece: "king", pieceClass: "fill-primary stroke-primary-ink" },
  welcome: { accent: "sparkles", piece: "knight", pieceClass: "fill-primary stroke-primary-ink" }
};

type IllustrationProps = {
  className?: string;
  name: IllustrationName;
  /** Only when the picture carries meaning the text around it doesn't; decorative otherwise. */
  title?: string;
};

/** A spot illustration sized by `className` (default 10rem wide, 4:5 tall). */
export function Illustration({ className, name, title }: IllustrationProps) {
  const scene = SCENES[name];
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={cn("h-auto w-40 shrink-0 select-none", className)}
      fill="none"
      role={title ? "img" : undefined}
      viewBox="0 0 200 160"
    >
      {title ? <title>{title}</title> : null}
      <circle className="fill-primary-soft" cx={100} cy={82} r={64} />
      <circle
        className="stroke-primary/20"
        cx={100}
        cy={84}
        r={74}
        strokeDasharray="2 7"
        strokeLinecap="round"
        strokeWidth={2}
      />
      <IsoBoard />
      <ellipse className="fill-app-text/10" cx={100} cy={112} rx={22} ry={5.5} />
      {scene.companion ? (
        <>
          <ellipse className="fill-app-text/10" cx={64} cy={118} rx={14} ry={3.5} />
          <Piece className="fill-accent stroke-accent-ink" height={52} shape={scene.companion} strokeWidth={1.2} width={52} x={38} y={72.5} />
        </>
      ) : null}
      <Piece className={scene.pieceClass} height={84} shape={scene.piece} strokeWidth={1.2} width={84} x={58} y={38.5} />
      <AccentMark accent={scene.accent} />
    </svg>
  );
}

/** A 4×4 isometric board centred at (100, 108). */
function IsoBoard() {
  const cells = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      cells.push(
        <rect
          className={(row + col) % 2 === 0 ? "fill-app-surface" : "fill-primary/30"}
          height={12}
          key={`${row}-${col}`}
          width={12}
          x={-24 + col * 12}
          y={-24 + row * 12}
        />
      );
    }
  }
  return (
    <g>
      <path className="fill-primary-dark" d="M52 108 100 132 148 108v7l-48 24-48-24Z" />
      <g transform="translate(100 108) matrix(1 0.5 -1 0.5 0 0)">
        {cells}
        <rect className="stroke-primary/40" height={48} strokeWidth={0.6} width={48} x={-24} y={-24} />
      </g>
    </g>
  );
}

function sparkle(cx: number, cy: number, r: number) {
  return `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`;
}

function starPoints(cx: number, cy: number, outer: number, inner: number) {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }
  return points.join(" ");
}

function AccentMark({ accent }: { accent: Accent }) {
  switch (accent) {
    case "alert":
      return (
        <g>
          <circle className="fill-app-danger" cx={150} cy={46} r={15} />
          <path className="stroke-on-danger" d="M150 38v10" strokeLinecap="round" strokeWidth={4} />
          <circle className="fill-on-danger" cx={150} cy={55} r={2.4} />
        </g>
      );
    case "book":
      return (
        <g className="fill-app-surface stroke-accent" strokeLinejoin="round" strokeWidth={2.5}>
          <path d="M133 37q8.5-4 17 0v22q-8.5-4-17 0Z" />
          <path d="M150 37q8.5-4 17 0v22q-8.5-4-17 0Z" />
        </g>
      );
    case "broadcast":
      return (
        <g className="stroke-app-danger" fill="none" strokeLinecap="round" strokeWidth={3}>
          <circle className="fill-app-danger" cx={150} cy={46} r={5} stroke="none" />
          <path d="M141 37a13 13 0 0 0 0 18M159 37a13 13 0 0 1 0 18" />
          <path className="stroke-app-danger/50" d="M134 30a23 23 0 0 0 0 32M166 30a23 23 0 0 1 0 32" />
        </g>
      );
    case "calendar":
      return (
        <g>
          <rect className="fill-app-surface stroke-primary" height={30} rx={4} strokeWidth={2.5} width={34} x={133} y={33} />
          <path className="fill-primary" d="M137 33h26a4 4 0 0 1 4 4v5h-34v-5a4 4 0 0 1 4-4Z" />
          <path className="stroke-primary-dark" d="M141 29v7M159 29v7" strokeLinecap="round" strokeWidth={3} />
          {[0, 1, 2].map((col) =>
            [0, 1].map((row) => (
              <rect
                className={col === 2 && row === 1 ? "fill-accent" : "fill-primary/35"}
                height={5}
                key={`${col}-${row}`}
                rx={1}
                width={6}
                x={139 + col * 9}
                y={46 + row * 8}
              />
            ))
          )}
        </g>
      );
    case "check":
      return (
        <g>
          <circle className="fill-success" cx={150} cy={46} r={15} />
          <path
            className="stroke-on-success"
            d="m143 46 5 5 9-10"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={4}
          />
        </g>
      );
    case "magnifier":
      return (
        <g className="stroke-accent" strokeLinecap="round">
          <circle className="fill-app-surface" cx={148} cy={44} r={12} strokeWidth={5} />
          <path d="m157 53 10 10" strokeWidth={6} />
        </g>
      );
    case "sparkles":
      return (
        <g className="fill-accent">
          <path d={sparkle(150, 40, 10)} />
          <path d={sparkle(166, 62, 5)} />
          <path d={sparkle(46, 50, 6)} />
        </g>
      );
    case "star":
      return (
        <g className="fill-accent">
          <polygon points={starPoints(150, 44, 15, 6.5)} />
          <path d={sparkle(46, 50, 6)} />
          <path d={sparkle(168, 68, 4.5)} />
        </g>
      );
    case "target":
      return (
        <g className="stroke-accent" fill="none">
          <circle cx={150} cy={44} r={15} strokeWidth={3} />
          <circle cx={150} cy={44} r={8} strokeWidth={3} />
          <circle className="fill-accent" cx={150} cy={44} r={2.5} stroke="none" />
        </g>
      );
  }
}
