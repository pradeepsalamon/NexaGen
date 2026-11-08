import { useId } from "react";
import { cn } from "@/lib/utils";
import { Piece, PIECE_PATHS } from "./pieces";

/**
 * The hero artwork for the navy `HeroBanner`: a king, knight and pawn on an
 * isometric board with a soft glow. Drawn for the brand surface in both themes
 * (it always sits on navy), from theme tokens only. Decorative.
 */
export function HeroChessArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const kingFill = `hero-king-${id}`;
  const glow = `hero-glow-${id}`;
  const boardFade = `hero-board-${id}`;

  const cells = [];
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      cells.push(
        <rect
          className={(row + col) % 2 === 0 ? "fill-on-brand/15" : "fill-primary/50"}
          height={14}
          key={`${row}-${col}`}
          width={14}
          x={-42 + col * 14}
          y={-42 + row * 14}
        />
      );
    }
  }

  return (
    <svg
      aria-hidden="true"
      className={cn("h-auto w-full select-none", className)}
      fill="none"
      viewBox="0 0 320 210"
    >
      <defs>
        <linearGradient id={kingFill} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: "rgb(var(--rgb-on-brand))" }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--rgb-primary-soft))" }} />
        </linearGradient>
        <radialGradient id={glow}>
          <stop offset="0" style={{ stopColor: "rgb(var(--rgb-primary))", stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--rgb-primary))", stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id={boardFade} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: "rgb(var(--rgb-on-brand))", stopOpacity: 1 }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--rgb-on-brand))", stopOpacity: 0.35 }} />
        </linearGradient>
        <mask id={`${boardFade}-mask`}>
          <rect fill={`url(#${boardFade})`} height={210} width={320} />
        </mask>
      </defs>

      <circle cx={196} cy={96} fill={`url(#${glow})`} r={110} />

      <g mask={`url(#${boardFade}-mask)`}>
        <path className="fill-brand-900" d="M112 168 196 210 280 168v8l-84 42-84-42Z" />
        <g transform="translate(196 168) matrix(1 0.5 -1 0.5 0 0)">{cells}</g>
      </g>

      <ellipse className="fill-scrim/30" cx={200} cy={165} rx={28} ry={7} />
      <ellipse className="fill-scrim/25" cx={146} cy={186} rx={16} ry={4} />
      <ellipse className="fill-scrim/25" cx={254} cy={178} rx={18} ry={5} />

      <Piece className="fill-on-brand/70" height={64} shape="pawn" width={64} x={114} y={130} />
      <Piece className="fill-accent" height={84} shape="knight" width={84} x={212} y={104} />
      <svg height={164} viewBox="0 0 64 64" width={164} x={118} y={20}>
        <path
          d={PIECE_PATHS.king}
          fill={`url(#${kingFill})`}
        />
        <path className="stroke-brand-900/20" d="M17 47h30" strokeWidth={1.2} />
      </svg>
    </svg>
  );
}
