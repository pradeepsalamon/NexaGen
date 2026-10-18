"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnnouncementsPanel } from "./AnnouncementsPanel";
import { DeliveryLogPanel } from "./DeliveryLogPanel";
import { MessagingRulesPanel } from "./MessagingRulesPanel";

export function MessagingClient() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Choose which moments send a message, what each one says, and who receives it."
        title="Messaging rules"
      />

      <Tabs defaultValue="rules">
        <TabsList className="justify-self-end">
          <TabsTrigger value="rules">Message rules</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="log">Delivery log</TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          <MessagingRulesPanel />
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
