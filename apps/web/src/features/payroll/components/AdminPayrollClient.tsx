"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { AdminPayrollPeriodsPanel } from "./AdminPayrollPeriodsPanel";
import { CompensationProfilesPanel } from "./CompensationProfilesPanel";
import { PayrollRulesPanel } from "./PayrollRulesPanel";

/** Admin → Finance → Coach Payroll. */
export function AdminPayrollClient() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-app-text">Coach Payroll</h1>
        <p className="text-sm text-app-muted">
          What the academy owes each coach, computed from actual teaching activity —
          separate from student billing.
        </p>
      </div>

      <Tabs defaultValue="periods">
        <TabsList className="justify-self-end">
          <TabsTrigger value="periods">Periods</TabsTrigger>
          <TabsTrigger value="compensation">Compensation</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="periods">
          <AdminPayrollPeriodsPanel />
        </TabsContent>

        <TabsContent value="compensation">
          <CompensationProfilesPanel />
        </TabsContent>

        <TabsContent value="rules">
          <PayrollRulesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
