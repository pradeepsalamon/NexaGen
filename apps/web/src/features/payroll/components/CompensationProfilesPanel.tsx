"use client";

import { useState } from "react";
import { COACH_ENGAGEMENT_TYPE_LABELS, COACH_COMPENSATION_MODEL_LABELS } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCompensationProfiles } from "../hooks/usePayrollApi";
import { CompensationProfileDialog } from "./CompensationProfileDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

/** Admin → Finance → Coach Payroll → Compensation (§13/§14/§26). */
export function CompensationProfilesPanel() {
  const { data, isLoading } = useCompensationProfiles();
  const [editingCoachId, setEditingCoachId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-sm text-app-muted">
        Every coach with a batch/class defaults to Employee + Hourly until you set
        something else here. A rate change never touches an already-calculated payroll
        period.
      </p>

      {isLoading ? <Skeleton className="h-64 w-full" /> : null}

      {data && data.profiles.length === 0 ? (
        <EmptyState description="No coaches found." title="Nothing to show" />
      ) : null}

      {data && data.profiles.length > 0 ? (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full min-w-[640px] border-collapse">
              <TableHeader>
                <TableRow className="border-b border-app-border">
                  {["Coach", "Engagement", "Compensation model", "Currency", ""].map((heading) => (
                    <TableHead
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      key={heading}
                    >
                      {heading}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.profiles.map((profile) => (
                  <TableRow className="border-b border-app-border last:border-0" key={profile.coachId}>
                    <TableCell className="text-left px-4 py-3">
                      <p className="text-sm font-semibold text-app-text">{profile.coachName}</p>
                      <p className="text-xs text-app-muted">{profile.coachEmail}</p>
                    </TableCell>
                    <TableCell className="text-left px-4 py-3 text-sm text-app-text">
                      {COACH_ENGAGEMENT_TYPE_LABELS[profile.engagementType]}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3 text-sm text-app-text">
                      {COACH_COMPENSATION_MODEL_LABELS[profile.defaultCompensationModel]}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3 text-sm text-app-muted">{profile.currency}</TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Button
                        onClick={() => setEditingCoachId(profile.coachId)}
                        size="sm"
                        variant="outline"
                      >
                        Configure
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : null}

      {editingCoachId ? (
        <CompensationProfileDialog coachId={editingCoachId} onClose={() => setEditingCoachId(null)} />
      ) : null}
    </div>
  );
}
