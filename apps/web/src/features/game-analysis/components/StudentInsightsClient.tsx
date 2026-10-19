import { PageHeader } from "@/components/layout/PageHeader";
import { GameInsightsPanel } from "./GameInsightsPanel";
import { GameSourcesCard } from "./GameSourcesCard";

/** /student/insights — the student's own games and what their analyses add up to. */
export function StudentInsightsClient() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Patterns across your analysed games: accuracy, mistakes, and the tactics you find and miss."
        title="Game insights"
      />
      <GameSourcesCard />
      <GameInsightsPanel studentId={null} />
    </div>
  );
}
