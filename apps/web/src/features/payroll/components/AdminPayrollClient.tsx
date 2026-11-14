"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { AdminPayrollPeriodsPanel } from "./AdminPayrollPeriodsPanel";
import { CompensationProfilesPanel } from "./CompensationProfilesPanel";
import { PayrollRulesPanel } from "./PayrollRulesPanel";

/** Admin → Finance → Coach Payroll. */
export function AdminPayrollClient() {
  return (
    <div>
      <Tabs defaultValue="periods">
        <PageHeader
          description="What the academy owes each coach, computed from actual teaching activity — separate from student billing."
          tabs={
            <TabsList>
              <TabsTrigger value="periods">Periods</TabsTrigger>
              <TabsTrigger value="compensation">Compensation</TabsTrigger>
              <TabsTrigger value="rules">Rules</TabsTrigger>
            </TabsList>
          }
          title="Coach payroll"
        />

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
