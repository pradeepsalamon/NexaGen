import { lazy, type ComponentType } from "react";
import {
  Award,
  BookOpen,
  Calculator,
  Clapperboard,
  Contrast,
  Crown,
  Dices,
  Flag,
  Gift,
  Scale,
  Sunrise,
  Timer,
  UsersRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { LiveClassInteractiveId } from "@nexa-chess/types";
import type { ToolContext } from "./shared";

// Each tool is its own download, fetched when someone opens it: a class uses
// one or two of the fourteen, and a student only ever needs the one on stage.
const ChessBalanceTool = lazy(() => import("./tools/ChessBalanceTool").then((m) => ({ default: m.ChessBalanceTool })));
const ChessLegendsTool = lazy(() => import("./tools/ChessLegendsTool").then((m) => ({ default: m.ChessLegendsTool })));
const ClassroomTimerTool = lazy(() => import("./tools/ClassroomTimerTool").then((m) => ({ default: m.ClassroomTimerTool })));
const GrandmasterMapperTool = lazy(() => import("./tools/GrandmasterMapperTool").then((m) => ({ default: m.GrandmasterMapperTool })));
const MysteryBoxTool = lazy(() => import("./tools/MysteryBoxTool").then((m) => ({ default: m.MysteryBoxTool })));
const OpeningOfTheDayTool = lazy(() => import("./tools/OpeningOfTheDayTool").then((m) => ({ default: m.OpeningOfTheDayTool })));
const PickStudentTool = lazy(() => import("./tools/PickStudentTool").then((m) => ({ default: m.PickStudentTool })));
const PuzzleRacerTool = lazy(() => import("./tools/PuzzleRacerTool").then((m) => ({ default: m.PuzzleRacerTool })));
const PuzzleStormTool = lazy(() => import("./tools/PuzzleStormTool").then((m) => ({ default: m.PuzzleStormTool })));
const RatingCalculatorTool = lazy(() => import("./tools/RatingCalculatorTool").then((m) => ({ default: m.RatingCalculatorTool })));
const TeamGeneratorTool = lazy(() => import("./tools/TeamGeneratorTool").then((m) => ({ default: m.TeamGeneratorTool })));
const VideoGeneratorTool = lazy(() => import("./tools/VideoGeneratorTool").then((m) => ({ default: m.VideoGeneratorTool })));
const WallOfMomentsTool = lazy(() => import("./tools/WallOfMomentsTool").then((m) => ({ default: m.WallOfMomentsTool })));
const WhiteOrBlackTool = lazy(() => import("./tools/WhiteOrBlackTool").then((m) => ({ default: m.WhiteOrBlackTool })));

/** Persisted in the PRESENTING tool state — the id list lives in @nexa-chess/types. */
export type InteractiveToolId = LiveClassInteractiveId;

export type InteractiveTool = {
  id: InteractiveToolId;
  label: string;
  /** One line under the panel title. */
  blurb: string;
  icon: LucideIcon;
  /** Tailwind classes for the round icon chip (token tints only). */
  tone: string;
  /** Lazy: render it inside a `<Suspense>` (see `InteractiveStage`). */
  Component: ComponentType<ToolContext>;
  /** Students play it on a board: their stage uses the full width, not a reading column. */
  wide?: boolean;
};

/** The launcher shows exactly these fourteen, in this order. */
export const INTERACTIVE_TOOLS: InteractiveTool[] = [
  {
    Component: PickStudentTool,
    blurb: "Spin the wheel to choose a student.",
    icon: Dices,
    id: "pick-student",
    label: "Pick a Student",
    tone: "bg-primary/10 text-primary-ink",
  },
  {
    Component: MysteryBoxTool,
    blurb: "A class goal with a surprise at the end.",
    icon: Gift,
    id: "mystery-box",
    label: "Mystery Box",
    tone: "bg-accent/20 text-accent-ink",
  },
  {
    Component: WallOfMomentsTool,
    blurb: "The class Hall of Fame.",
    icon: Award,
    id: "wall-of-moments",
    label: "Wall of Moments",
    tone: "bg-primary/15 text-primary-ink",
  },
  {
    Component: TeamGeneratorTool,
    blurb: "Random, balanced teams or pairs.",
    icon: UsersRound,
    id: "team-generator",
    label: "Team Generator",
    tone: "bg-success/15 text-success-ink",
  },
  {
    Component: GrandmasterMapperTool,
    blurb: "Every student becomes a grandmaster.",
    icon: Crown,
    id: "grandmaster-mapper",
    label: "Grandmaster Mapper",
    tone: "bg-accent/20 text-accent-ink",
  },
  {
    Component: ChessBalanceTool,
    blurb: "Weigh material with standard piece values.",
    icon: Scale,
    id: "chess-balance",
    label: "Chess Balance",
    tone: "bg-primary/10 text-primary-ink",
  },
  {
    Component: WhiteOrBlackTool,
    blurb: "A fair coin flip for colours.",
    icon: Contrast,
    id: "white-or-black",
    label: "White or Black",
    tone: "bg-app-soft text-app-text",
  },
  {
    Component: ChessLegendsTool,
    blurb: "Stories from chess history.",
    icon: BookOpen,
    id: "chess-legends",
    label: "Chess Legends",
    tone: "bg-primary/15 text-primary-ink",
  },
  {
    Component: OpeningOfTheDayTool,
    blurb: "Step through today's opening.",
    icon: Sunrise,
    id: "opening-of-the-day",
    label: "Opening of the Day",
    tone: "bg-accent/20 text-accent-ink",
  },
  {
    Component: VideoGeneratorTool,
    blurb: "Turn a class game into a highlight video.",
    icon: Clapperboard,
    id: "video-generator",
    label: "Chess Video Generator",
    tone: "bg-primary/10 text-primary-ink",
  },
  {
    Component: RatingCalculatorTool,
    blurb: "Elo rating changes from game results.",
    icon: Calculator,
    id: "rating-calculator",
    label: "Rating Calculator",
    tone: "bg-success/15 text-success-ink",
  },
  {
    Component: ClassroomTimerTool,
    blurb: "Lesson phases on one shared clock.",
    icon: Timer,
    id: "classroom-timer",
    label: "Classroom Timer",
    tone: "bg-primary/15 text-primary-ink",
  },
  {
    Component: PuzzleStormTool,
    blurb: "Lichess Puzzle Storm: solve all you can in 3 minutes.",
    icon: Zap,
    id: "puzzle-storm",
    label: "Puzzle Storm",
    tone: "bg-primary/10 text-primary-ink",
    wide: true,
  },
  {
    Component: PuzzleRacerTool,
    blurb: "Lichess Puzzle Racer: the class races for 90 seconds.",
    icon: Flag,
    id: "puzzle-racer",
    label: "Puzzle Racer",
    tone: "bg-success/15 text-success-ink",
    wide: true,
  },
];

export function findInteractiveTool(id: string | null | undefined): InteractiveTool | null {
  return INTERACTIVE_TOOLS.find((t) => t.id === id) ?? null;
}
