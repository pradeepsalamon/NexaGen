"use client";

import Link from "next/link";
import { Award, Download, Medal, Swords, Trophy } from "lucide-react";
import type { TournamentHistoryResponse } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { certificatePdfUrl } from "../api/tournamentsApi";
import { useMyHistory, useStudentHistory } from "../hooks/useTournaments";
import { points } from "../lib/format";
import { playerStatusLabel } from "./TournamentBits";

function HistoryBody({ data }: { data: TournamentHistoryResponse }) {
  const timeZone = useUserTimeZone();
  const entries = data.entries;
  if (entries.length === 0) {
    return <EmptyState description="Tournaments appear here once you've played in one." icon={Trophy} title="No tournaments yet" />;
  }
  const played = entries.reduce((s, e) => s + e.played, 0);
  const wins = entries.reduce((s, e) => s + e.wins, 0);
  const podiums = entries.filter((e) => e.rank !== null && e.rank <= 3 && e.tournament.status === "COMPLETED").length;
  const certificates = entries.reduce((s, e) => s + e.certificates.filter((c) => !c.revokedAt).length, 0);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Trophy} label="Tournaments" tone="primary" value={String(entries.length)} />
        <StatTile icon={Swords} label="Games (wins)" tone="secondary" value={`${played} (${wins})`} />
        <StatTile icon={Medal} label="Podium finishes" tone="accent" value={String(podiums)} />
        <StatTile icon={Award} label="Certificates" tone="reward" value={String(certificates)} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tournament</TableHead>
            <TableHead className="hidden sm:table-cell">Date</TableHead>
            <TableHead className="text-right">Rank</TableHead>
            <TableHead className="text-right">Points</TableHead>
            <TableHead className="hidden text-right md:table-cell">+ = −</TableHead>
            <TableHead className="hidden text-right lg:table-cell">Perf</TableHead>
            <TableHead pin="end">
              <span className="sr-only">Certificates</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => (
            <TableRow key={e.tournament.id}>
              <TableCell>
                <Link className="font-medium hover:underline" href={`/tournaments/${e.tournament.id}`}>
                  {e.tournament.name}
                </Link>
                {e.status !== "APPROVED" ? (
                  <Badge className="ml-2" variant="secondary">
                    {playerStatusLabel(e.status)}
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="hidden sm:table-cell">{formatFullDate(e.tournament.startsAt, timeZone)}</TableCell>
              <TableCell className="text-right tabular-nums">{e.rank ?? "–"}</TableCell>
              <TableCell className="text-right tabular-nums">{points(e.points, e.pointsUnit)}</TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">
                {e.wins} {e.draws} {e.losses}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums lg:table-cell">{e.performance ?? "–"}</TableCell>
              <TableCell pin="end">
                <div className="flex justify-end gap-1">
                  {e.certificates
                    .filter((c) => !c.revokedAt)
                    .map((c) => (
                      <SimpleTooltip key={c.id} label={`Certificate: ${c.placement}`}>
                        <Button asChild className="size-8 p-0" variant="neutral">
                          <a aria-label={`Download certificate (${c.placement})`} href={certificatePdfUrl(c.id)} rel="noreferrer" target="_blank">
                            <Download className="size-4" strokeWidth={2.5} />
                          </a>
                        </Button>
                      </SimpleTooltip>
                    ))}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function MyHistoryClient() {
  const history = useMyHistory();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader breadcrumbs={[{ href: "/tournaments", label: "Tournaments" }, { label: "My history" }]} description="Your results and certificates." title="My tournaments" />
      {history.isError ? <Alert variant="error">Couldn&apos;t load your history.</Alert> : history.data ? <HistoryBody data={history.data} /> : <Skeleton className="h-64" />}
    </div>
  );
}

export function StudentHistoryClient({ userId }: { userId: string }) {
  const history = useStudentHistory(userId);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader breadcrumbs={[{ href: "/admin/tournaments", label: "Tournaments" }, { label: "Student history" }]} title="Student tournament history" />
      {history.isError ? <Alert variant="error">This student&apos;s history isn&apos;t available to you.</Alert> : history.data ? <HistoryBody data={history.data} /> : <Skeleton className="h-64" />}
    </div>
  );
}
