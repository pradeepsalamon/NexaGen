"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnnouncementsPanel } from "./AnnouncementsPanel";
import { DeliveryLogPanel } from "./DeliveryLogPanel";
import { MessagingRulesPanel } from "./MessagingRulesPanel";
import { SystemMessagesPanel } from "./SystemMessagesPanel";

export function MessagingClient() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="rules">
        <PageHeader
          description="Choose which moments send a message, what each one says, and who receives it."
          tabs={
            <TabsList>
              <TabsTrigger value="rules">Message rules</TabsTrigger>
              <TabsTrigger value="system">System messages</TabsTrigger>
              <TabsTrigger value="announcements">Announcements</TabsTrigger>
              <TabsTrigger value="log">Delivery log</TabsTrigger>
            </TabsList>
          }
          title="Messaging rules"
        />

        <TabsContent value="rules">
          <MessagingRulesPanel />
        </TabsContent>
        <TabsContent value="system">
          <SystemMessagesPanel />
        </TabsContent>
        <TabsContent value="announcements">
          <AnnouncementsPanel />
        </TabsContent>
        <TabsContent value="log">
          <DeliveryLogPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
