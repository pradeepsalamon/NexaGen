"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PAYROLL_RULE_TYPE_LABELS } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { usePayrollRules, useUpdatePayrollRule } from "../hooks/usePayrollApi";
import { RuleDialog } from "./RuleDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";

/** Admin → Finance → Coach Payroll → Rules (§7/§26). */
export function PayrollRulesPanel() {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = usePayrollRules();
  const { rows: rules, sortProps } = useTableSort({
    rows: data?.rules,
    accessors: {
      effectiveFrom: (r) => r.effectiveFrom,
      enabled: (r) => r.enabled,
      name: (r) => r.name,
      priority: (r) => r.priority,
      type: (r) => PAYROLL_RULE_TYPE_LABELS[r.ruleType]
    }
  });
  const toggleEnabled = useUpdatePayrollRule();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-app-muted">
          Cancellation, attendance, bonus and deduction rules the calculation engine
          applies on top of a coach&apos;s base rate. Highest priority wins.
        </p>
        <Button onClick={() => setCreating(true)} size="sm">
          <Plus className="mr-1.5 size-4" strokeWidth={2.5} />
          New rule
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" /> : null}

      {data && data.rules.length === 0 ? (
        <EmptyState
          action={{ label: "Create the first rule", onClick: () => setCreating(true) }}
          description="Without a rule, a cancelled class simply isn't paid."
          title="No payroll rules yet"
        />
      ) : null}

      {data && data.rules.length > 0 ? (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full min-w-[640px] border-collapse">
              <TableHeader>
                <TableRow className="border-b border-app-border">
                  {([["Name", "name"], ["Type", "type"], ["Priority", "priority"], ["Effective from", "effectiveFrom"], ["Enabled", "enabled"], ["", null]] as const).map(([heading, sortKey]) => (
                    <TableHead
                      className="px-4 py-3 text-left text-xs font-semibold"
                      key={heading}
                    >
                      {sortKey ? <SortButton label={heading} {...sortProps(sortKey)} /> : heading}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow className="border-b border-app-border last:border-0" key={rule.id}>
                    <TableCell className="text-left px-4 py-3">
                      <p className="text-sm font-semibold text-app-text">{rule.name}</p>
                      {rule.description ? (
                        <p className="text-xs text-app-muted">{rule.description}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3">
                      <Badge variant="outline">{PAYROLL_RULE_TYPE_LABELS[rule.ruleType]}</Badge>
                    </TableCell>
                    <TableCell className="text-left px-4 py-3 text-sm tabular-nums text-app-muted">{rule.priority}</TableCell>
                    <TableCell className="text-left px-4 py-3 text-xs text-app-muted">
                      {formatFullDate(rule.effectiveFrom, timeZone)}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3">
                      <Badge variant={rule.enabled ? "success" : "secondary"}>
                        {rule.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Button
                        onClick={() =>
                          toggleEnabled.mutate({ id: rule.id, body: { enabled: !rule.enabled } })
                        }
                        size="sm"
                        variant="outline"
                      >
                        {rule.enabled ? "Disable" : "Enable"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : null}

      {creating ? <RuleDialog onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
