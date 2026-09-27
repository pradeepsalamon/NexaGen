"use client";

import { useState } from "react";
import { ClipboardList, MessageSquareText, Star } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { CoachRatingsPanel } from "./CoachRatingsPanel";
import { FeedbackFormsPanel } from "./FeedbackFormsPanel";
import { FeedbackResponsesPanel, type ResponseFilters } from "./FeedbackResponsesPanel";

type Tab = "forms" | "ratings" | "responses";

export function AdminFeedbackClient() {
  const [tab, setTab] = useState<Tab>("forms");
  const [filters, setFilters] = useState<ResponseFilters>({ coachId: "", formId: "", page: 1 });

  return (
    <div className="grid gap-6 pb-10">
      <PageHeader
        description="Design the feedback students give about their coaches, and decide when and where they're asked."
        title="Coach Feedback"
      />

      <Tabs onValueChange={(value) => setTab(value as Tab)} value={tab}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit sm:justify-self-end">
          <TabsTrigger value="forms">
            <ClipboardList aria-hidden="true" className="size-4" />
            Forms
          </TabsTrigger>
          <TabsTrigger value="ratings">
            <Star aria-hidden="true" className="size-4" />
            Coach ratings
          </TabsTrigger>
          <TabsTrigger value="responses">
            <MessageSquareText aria-hidden="true" className="size-4" />
            Responses
          </TabsTrigger>
        </TabsList>

        <TabsContent className="mt-6 outline-none" value="forms">
          <FeedbackFormsPanel />
        </TabsContent>
        <TabsContent className="mt-6 outline-none" value="ratings">
          <CoachRatingsPanel
            onViewResponses={(coachId) => {
              setFilters({ coachId, formId: "", page: 1 });
              setTab("responses");
            }}
          />
        </TabsContent>
        <TabsContent className="mt-6 outline-none" value="responses">
          <FeedbackResponsesPanel filters={filters} onFiltersChange={setFilters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
