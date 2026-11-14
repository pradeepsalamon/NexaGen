"use client";

import { useMemo } from "react";
import { Shuffle } from "lucide-react";
import { shuffled } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import {
  useClassroomTool,
  useSaveClassroomTool,
} from "../../../../hooks/useClassroomTools";
import {
  GRANDMASTERS,
  grandmasterById,
  type GrandmasterProfile,
} from "../../../../lib/interactives/grandmasters";
import {
  CoachRunsThis,
  cryptoRandom,
  RosterSourcePicker,
  ToolLoadError,
  ToolLoading,
  useToolRoster,
  type ToolContext,
} from "../shared";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-ZÀ-Ž]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

export function GrandmasterMapperTool({ classId, isManager }: ToolContext) {
  const tool = useClassroomTool(classId, "GM_MAPPER");
  const save = useSaveClassroomTool(classId, "GM_MAPPER");
  const roster = useToolRoster(classId, isManager);
  const myId = useAuthStore((s) => s.user?.id);

  const assign = () => {
    // Everyone gets a different grandmaster while the collection lasts, then it cycles.
    const deck: GrandmasterProfile[] = [];
    while (deck.length < roster.students.length)
      deck.push(...shuffled(GRANDMASTERS, cryptoRandom));
    save.mutate({
      assignments: roster.students.map((s, i) => ({ ...s, gmId: deck[i].id })),
      generatedAt: new Date().toISOString(),
    });
  };

  const rows = useMemo(
    () =>
      (tool.state?.assignments ?? [])
        .map((a) => ({ ...a, gm: grandmasterById(a.gmId) }))
        .filter(
          (a): a is typeof a & { gm: GrandmasterProfile } => a.gm !== null,
        )
        // A student sees their own grandmaster first.
        .sort((a, b) => Number(b.id === myId) - Number(a.id === myId)),
    [tool.state, myId],
  );

  if (tool.isLoading) return <ToolLoading />;
  if (tool.isError)
    return <ToolLoadError onRetry={() => void tool.refetch()} />;

  return (
    <div className="space-y-4">
      {isManager ? (
        <div className="space-y-3">
          <p className="text-sm text-app-muted">
            Give every student a grandmaster identity from a collection of{" "}
            {GRANDMASTERS.length} legends. It stays with the batch for the next
            class too.
          </p>
          <RosterSourcePicker roster={roster} />
          <div className="flex justify-end">
            <Button
              disabled={roster.students.length === 0}
              isLoading={save.isPending}
              onClick={assign}
            >
              <Shuffle
                aria-hidden="true"
                className="size-4"
                strokeWidth={2.5}
              />
              {rows.length ? "Reshuffle" : "Assign grandmasters"}
            </Button>
          </div>
        </div>
      ) : (
        <CoachRunsThis />
      )}

      {rows.length === 0 ? (
        !isManager ? (
          <p className="text-sm text-app-muted">
            No grandmasters assigned yet.
          </p>
        ) : null
      ) : (
        <ul className="space-y-2">
          {rows.map(({ id, name, gm }) => (
            <li
              className={cn(
                "flex gap-3 rounded-control border border-app-border p-3",
                id === myId
                  ? "border-primary/40 bg-primary/[0.06]"
                  : "bg-app-surface",
              )}
              key={id}
            >
              <div
                aria-hidden="true"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-white"
              >
                {initials(gm.name)}
              </div>
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-bold text-app-text">
                    {id === myId ? "You" : name}
                  </span>
                  <span className="text-app-muted">
                    {id === myId ? " are " : " is "}
                  </span>
                  <span className="font-extrabold text-primary-ink">
                    {gm.name}
                  </span>
                </p>
                <p className="text-xs text-app-muted">
                  {gm.country} · {gm.years} · {gm.known}
                </p>
                <p className="mt-1 text-xs text-app-text">
                  <span className="font-bold">Style:</span> {gm.style}.{" "}
                  {gm.fact}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
