"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { AdminCreditNotesPanel } from "./AdminCreditNotesPanel";
import { AdminInvoicesPanel } from "./AdminInvoicesPanel";
import { InvoiceSettingsPanel } from "./InvoiceSettingsPanel";

/** Admin → Finance (§17), with the §4 billing settings alongside. */
export function AdminFinanceClient() {
  return (
    <div>
      <Tabs defaultValue="invoices">
        <PageHeader
          description="Every invoice issued by the academy, the credit notes raised against them, and the business details they carry."
          tabs={
            <TabsList>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="credit-notes">Credit notes</TabsTrigger>
              <TabsTrigger value="settings">Billing &amp; invoicing</TabsTrigger>
            </TabsList>
          }
          title="Invoices"
        />

        <TabsContent value="invoices">
          <AdminInvoicesPanel />
        </TabsContent>

        <TabsContent value="credit-notes">
          <AdminCreditNotesPanel />
        </TabsContent>

        <TabsContent value="settings">
          <InvoiceSettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
