"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { StudentPuzzleListQuery } from "@nexa-chess/types";
import { CheckCircle2, PlayCircle, Puzzle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePuzzleTopics } from "../hooks/usePuzzlesApi";
import { useMyPuzzles } from "../hooks/usePuzzlesApi";
import {
  PUZZLE_DIFFICULTY_LABELS,
  PUZZLE_DIFFICULTY_OPTIONS,
  PUZZLE_TYPE_LABELS,
  PUZZLE_TYPE_OPTIONS,
  difficultyBadgeVariant
} from "../lib/puzzleMeta";

export function StudentPuzzlesClient() {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 350);
  const [topicId, setTopicId] = useState("");
  const [puzzleType, setPuzzleType] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [solved, setSolved] = useState("");
  const [page, setPage] = useState(1);

  const { data: topicsData } = usePuzzleTopics();

  const query: StudentPuzzleListQuery = useMemo(
    () => ({
      page,
      pageSize: 24,
      search: search || undefined,
      topicId: topicId || undefined,
      puzzleType: (puzzleType || undefined) as StudentPuzzleListQuery["puzzleType"],
      difficulty: (difficulty || undefined) as StudentPuzzleListQuery["difficulty"],
      solved: (solved || undefined) as StudentPuzzleListQuery["solved"]
    }),
    [page, search, topicId, puzzleType, difficulty, solved]
  );

  const { data, isLoading, isPlaceholderData } = useMyPuzzles(query);
  const puzzles = data?.puzzles ?? [];
  const pagination = data?.pagination;

  const topicOptions = (topicsData?.topics ?? []).map((t) => ({ value: t.id, label: t.name }));
  const hasFilters = Boolean(searchInput || topicId || puzzleType || difficulty || solved);

  const clear = () => {
    setSearchInput("");
    setTopicId("");
    setPuzzleType("");
    setDifficulty("");
    setSolved("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-app-text">Puzzles</h1>
        <p className="mt-1 text-sm text-app-muted">
          Practice tactics and endgames at your own pace.
        </p>
      </div>

      <Card className="grid gap-4 p-4">
        <div className="flex flex-wrap gap-2">
          <Input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            placeholder="Search puzzles…"
            className="w-full sm:w-56"
          />
          <Select
            aria-label="Filter by topic"
            value={topicId}
            placeholder="All topics"
            options={topicOptions}
            onChange={(e) => {
              setTopicId(e.target.value);
              setPage(1);
            }}
            className="w-auto"
          />
          <Select
            aria-label="Filter by type"
            value={puzzleType}
            placeholder="All types"
            options={PUZZLE_TYPE_OPTIONS}
            onChange={(e) => {
              setPuzzleType(e.target.value);
              setPage(1);
            }}
            className="w-auto"
          />
          <Select
            aria-label="Filter by difficulty"
            value={difficulty}
            placeholder="All difficulties"
            options={PUZZLE_DIFFICULTY_OPTIONS}
            onChange={(e) => {
              setDifficulty(e.target.value);
              setPage(1);
            }}
            className="w-auto"
          />
          <Select
            aria-label="Filter by solved"
            value={solved}
            placeholder="Solved & unsolved"
            options={[
              { value: "no", label: "Not solved" },
              { value: "yes", label: "Solved" }
            ]}
            onChange={(e) => {
              setSolved(e.target.value);
              setPage(1);
            }}
            className="w-auto"
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clear}>
              Clear
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : puzzles.length === 0 ? (
          <EmptyState
            icon={Puzzle}
            title={hasFilters ? "No puzzles match your filters" : "No puzzles available yet"}
            description={
              hasFilters
                ? "Try a different search or clear the filters."
                : "Your coach hasn't published any puzzles yet."
            }
            action={hasFilters ? { label: "Clear filters", onClick: clear } : undefined}
          />
        ) : (
          <div
            className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${
              isPlaceholderData ? "opacity-60" : ""
            }`}
          >
            {puzzles.map((p) => (
              <Card key={p.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-app-text">{p.title}</p>
                  {p.solved && (
                    <CheckCircle2 className="size-5 shrink-0 text-accent-ink" strokeWidth={2.5} />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{p.topicName}</Badge>
                  <Badge variant={difficultyBadgeVariant(p.difficulty)}>
                    {PUZZLE_DIFFICULTY_LABELS[p.difficulty]}
                  </Badge>
                  <span className="text-xs text-app-muted">{PUZZLE_TYPE_LABELS[p.puzzleType]}</span>
                </div>
                <Button asChild size="sm" variant="outline" className="mt-auto">
                  <Link href={`/student/puzzles/${p.id}`}>
                    <PlayCircle className="mr-1.5 size-4" strokeWidth={2.5} />
                    {p.solved ? "Solve again" : "Solve"}
                  </Link>
                </Button>
              </Card>
            ))}
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-app-muted">
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
