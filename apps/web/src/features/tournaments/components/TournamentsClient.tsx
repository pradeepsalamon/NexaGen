"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { History, Plus, Search, Trophy } from "lucide-react";
import { TOURNAMENT_FORMATS, TOURNAMENT_FORMAT_LABELS, type TournamentListTab } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { WidgetError } from "@/components/ui/WidgetError";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useCapabilities, useTournamentList } from "../hooks/useTournaments";
import { Pager, TournamentCard } from "./TournamentBits";

const TAB_LABELS: Record<TournamentListTab, string> = {
  cancelled: "Cancelled",
  completed: "Finished",
  drafts: "Drafts",
  hosting: "Hosting",
  live: "Live",
  mine: "My entries",
  upcoming: "Upcoming"
};

const EMPTY: Record<TournamentListTab, string> = {
  cancelled: "No cancelled tournaments.",
  completed: "No finished tournaments yet.",
  drafts: "Drafts you create appear here until you publish them.",
  hosting: "Tournaments where you are a host, co-host or commentator.",
  live: "Nothing is being played right now.",
  mine: "Tournaments you've entered or been invited to appear here.",
  upcoming: "No tournaments are scheduled yet."
};

export function TournamentsClient() {
  const router = useRouter();
  const capabilities = useCapabilities();
  const canCreate = capabilities.data?.canCreate ?? false;
  const [tab, setTab] = useState<TournamentListTab>("upcoming");
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search.trim(), 300);
  const list = useTournamentList(tab, { format, page, search: debounced });
  const tabs: TournamentListTab[] = canCreate ? ["live", "upcoming", "mine", "hosting", "drafts", "completed", "cancelled"] : ["live", "upcoming", "mine", "completed"];

  return (
    <div className="flex flex-col gap-5">
      <Tabs
        onValueChange={(value) => {
          setTab(value as TournamentListTab);
          setPage(1);
        }}
        value={tab}
      >
        <PageHeader
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/tournaments/history">
                  <History className="size-4" />
                  My history
                </Link>
              </Button>
              {canCreate ? (
                <Button asChild>
                  <Link href="/tournaments/new">
                    <Plus className="size-4" />
                    New tournament
                  </Link>
                </Button>
              ) : null}
            </>
          }
          description="Swiss, arena, round robin and knockout events for the academy."
          tabs={
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t} value={t}>
                  {TAB_LABELS[t]}
                </TabsTrigger>
              ))}
            </TabsList>
          }
          title="Tournaments"
        />
      </Tabs>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          aria-label="Search tournaments"
          className="sm:max-w-xs"
          leadingIcon={<Search className="size-4" />}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name"
          value={search}
        />
        <Select
          aria-label="Format"
          className="sm:w-48"
          onChange={(e) => {
            setFormat(e.target.value);
            setPage(1);
          }}
          options={[{ label: "All formats", value: "" }, ...TOURNAMENT_FORMATS.map((f) => ({ label: TOURNAMENT_FORMAT_LABELS[f], value: f }))]}
          value={format}
        />
      </div>
      {list.isError ? (
        <WidgetError onRetry={() => void list.refetch()} />
      ) : list.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton className="h-48" key={i} />
          ))}
        </div>
      ) : list.data && list.data.items.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.data.items.map((t) => (
              <TournamentCard href={`/tournaments/${t.id}`} key={t.id} tournament={t} />
            ))}
          </div>
          <Pager onPage={setPage} page={list.data.pagination.page} total={list.data.pagination.total} totalPages={list.data.pagination.totalPages} />
        </>
      ) : (
        <EmptyState
          action={canCreate && (tab === "drafts" || tab === "upcoming") ? { label: "New tournament", onClick: () => router.push("/tournaments/new") } : undefined}
          description={EMPTY[tab]}
          icon={Trophy}
          title={debounced || format ? "No tournaments match" : `No ${TAB_LABELS[tab].toLowerCase()} tournaments`}
        />
      )}
    </div>
  );
}
