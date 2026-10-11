"use client";

import { useState } from "react";
import { Shuffle, Users } from "lucide-react";
import { shuffled, splitIntoTeams, type TeamsState } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatTime } from "@/lib/datetime";
import {
  useClassroomTool,
  useSaveClassroomTool,
} from "../../../../hooks/useClassroomTools";
import {
  CoachRunsThis,
  cryptoRandom,
  RosterSourcePicker,
  ToolLoadError,
  ToolLoading,
  useToolRoster,
  type ToolContext,
} from "../shared";

const TEAM_NAMES = ["Knights", "Bishops", "Rooks", "Queens", "Kings", "Pawns"];
const teamName = (i: number) =>
  i < TEAM_NAMES.length ? `Team ${TEAM_NAMES[i]}` : `Team ${i + 1}`;

export function TeamGeneratorTool({ classId, isManager }: ToolContext) {
  const tool = useClassroomTool(classId, "TEAMS");
  const save = useSaveClassroomTool(classId, "TEAMS");
  const roster = useToolRoster(classId, isManager);
  const timeZone = useUserTimeZone();
  const [mode, setMode] = useState<TeamsState["mode"]>(
    tool.state?.mode ?? "COUNT",
  );
  const [value, setValue] = useState(String(tool.state?.value ?? 2));

  if (tool.isLoading) return <ToolLoading />;
  if (tool.isError)
    return <ToolLoadError onRetry={() => void tool.refetch()} />;

  const state = tool.state;
  const n = Number.parseInt(value, 10);
  const valid = Number.isFinite(n) && n >= 1 && n <= 50;

  const generate = (overrideMode = mode, overrideValue = n) => {
    const groups = splitIntoTeams(
      shuffled(roster.students, cryptoRandom),
      overrideMode,
      overrideValue,
    );
    save.mutate({
      generatedAt: new Date().toISOString(),
      mode: overrideMode,
      teams: groups.map((members, i) => ({ members, name: teamName(i) })),
      value: overrideValue,
    });
  };

  return (
    <div className="space-y-4">
      {isManager ? (
        <div className="space-y-3">
          <RosterSourcePicker roster={roster} />
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <div className="space-y-1.5">
              <Label>Split by</Label>
              <Tabs
                onValueChange={(v) => setMode(v as TeamsState["mode"])}
                value={mode}
              >
                <TabsList className="w-full">
                  <TabsTrigger className="flex-1" value="COUNT">
                    Number of teams
                  </TabsTrigger>
                  <TabsTrigger className="flex-1" value="SIZE">
                    Team size
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <Input
              aria-label={
                mode === "COUNT" ? "Number of teams" : "Students per team"
              }
              className="w-20"
              inputMode="numeric"
              max={50}
              min={1}
              onChange={(e) => setValue(e.target.value)}
              type="number"
              value={value}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              disabled={roster.students.length < 2}
              onClick={() => {
                setMode("SIZE");
                setValue("2");
                generate("SIZE", 2);
              }}
              variant="outline"
            >
              <Users aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Make pairs
            </Button>
            <Button
              disabled={!valid || roster.students.length === 0}
              isLoading={save.isPending}
              onClick={() => generate()}
            >
              <Shuffle
                aria-hidden="true"
                className="size-4"
                strokeWidth={2.5}
              />
              {state ? "Regenerate" : "Generate teams"}
            </Button>
          </div>
        </div>
      ) : (
        <CoachRunsThis />
      )}

      {state && state.teams.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-app-muted">
            {state.teams.length} team{state.teams.length === 1 ? "" : "s"} ·
            made at {formatTime(state.generatedAt, timeZone)}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {state.teams.map((team, i) => (
              <li
                className="rounded-control border border-app-border bg-app-soft p-3"
                key={team.name + i}
              >
                <p className="text-sm font-extrabold text-primary-ink">
                  {team.name}{" "}
                  <span className="font-semibold text-app-muted">
                    ({team.members.length})
                  </span>
                </p>
                <ul className="mt-1 space-y-0.5 text-sm text-app-text">
                  {team.members.map((m) => (
                    <li key={m.id}>{m.name}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : !isManager ? (
        <p className="text-sm text-app-muted">No teams yet.</p>
      ) : null}
    </div>
  );
}
