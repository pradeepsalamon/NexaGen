"use client";

import { weeklyReportRange, type WeeklyFacts } from "@nexa-chess/types";
import { CalendarCheck, ClipboardList, Puzzle, Target } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";

const fraction = (a: number, b: number) => (b > 0 ? `${a} / ${b}` : "–");

/** One week: four numbers, then the report's lines (its first line is the title). */
export function WeeklyReportCard({ badge, facts, text, title }: { facts: WeeklyFacts; text: string; title?: string; badge?: ReactNode }) {
  const lines = text.split("\n").slice(1).filter(Boolean);
  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-bold text-app-text">{title ?? `Week of ${weeklyReportRange(facts.weekStart)}`}</h2>
        {badge}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={CalendarCheck} label="Classes attended" tone="primary" value={fraction(facts.classes.attended, facts.classes.held)} />
        <StatTile
          icon={ClipboardList}
          label="Homework on time"
          tone="reward"
          value={fraction(facts.homework.done, facts.homework.due)}
        />
        <StatTile icon={Puzzle} label="Puzzles solved" tone="accent" value={String(facts.practice.puzzlesSolved)} />
        <StatTile icon={Target} label="Accuracy" tone="secondary" value={facts.play.accuracy === null ? "–" : `${facts.play.accuracy}%`} />
      </div>
      <ul className="space-y-1.5 text-sm text-app-text">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </Card>
  );
}
