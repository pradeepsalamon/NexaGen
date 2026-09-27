"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { AdminCreditNotesPanel } from "./AdminCreditNotesPanel";
import { AdminInvoicesPanel } from "./AdminInvoicesPanel";
import { InvoiceSettingsPanel } from "./InvoiceSettingsPanel";

/** Admin → Finance (§17), with the §4 billing settings alongside. */
export function AdminFinanceClient() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-app-text">Invoices</h1>
        <p className="text-sm text-app-muted">
          Every invoice issued by the academy, the credit notes raised against
          them, and the business details they carry.
        </p>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList className="justify-self-end">
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="credit-notes">Credit notes</TabsTrigger>
          <TabsTrigger value="settings">Billing &amp; invoicing</TabsTrigger>
        </TabsList>

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
