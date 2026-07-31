import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Target, ArrowRight } from "lucide-react";
import Link from "next/link";

interface PracticeItem {
  id: string;
  title: string;
  dueDate: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  status: "Pending" | "In Progress" | "Completed";
}

interface PracticeSectionProps {
  practices?: PracticeItem[];
}

export function PracticeSection({ practices = [] }: PracticeSectionProps) {
  return (
    <Card className="border-app-border bg-app-surface shadow-sm h-full flex flex-col">
      <CardHeader className="pb-4 border-b border-app-border/50 flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Target className="h-5 w-5 text-secondary" />
          Assignments & Practice
        </CardTitle>
        <Link href="/student/practice">
          <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/10">
            View All
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-auto">
        {practices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <div className="bg-app-background p-4 rounded-full mb-3 border border-app-border">
              <Target className="h-8 w-8 text-app-muted" />
            </div>
            <p className="text-app-text font-medium">No pending practice assigned.</p>
            <p className="text-sm text-app-muted mt-1">Check back later for new exercises.</p>
          </div>
        ) : (
          <div className="divide-y divide-app-border/50">
            {practices.map((practice) => (
              <div key={practice.id} className="p-5 flex flex-col sm:flex-row justify-between gap-4 hover:bg-app-background/50 transition-colors">
                <div className="space-y-2">
                  <h4 className="font-semibold text-app-text">{practice.title}</h4>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline" className={
                      practice.difficulty === "Beginner" ? "text-green-600 border-green-200 bg-green-50" : 
                      practice.difficulty === "Intermediate" ? "text-yellow-600 border-yellow-200 bg-yellow-50" : 
                      "text-red-600 border-red-200 bg-red-50"
                    }>
                      {practice.difficulty}
                    </Badge>
                    <span className="text-app-muted font-medium bg-app-background px-2 py-0.5 rounded border border-app-border">
                      Due: {practice.dueDate}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <Link href={`/student/practice/${practice.id}`} className="w-full sm:w-auto">
                    <Button 
                      variant={practice.status === "Completed" ? "outline" : "primary"} 
                      size="sm" 
                      className={`w-full font-bold ${practice.status !== 'Completed' ? 'bg-primary text-white hover:opacity-90' : ''}`}
                    >
                      {practice.status === "Pending" ? "Start" : practice.status === "In Progress" ? "Resume" : "View Result"}
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

