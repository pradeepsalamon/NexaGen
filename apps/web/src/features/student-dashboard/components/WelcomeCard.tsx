import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Play } from "lucide-react";
import Link from "next/link";

interface WelcomeCardProps {
  studentName: string;
  batchName?: string;
  courseName?: string;
  memberSince?: string;
  avatarUrl?: string;
  liveClassId?: string; // If there's an active live class
}

export function WelcomeCard({
  studentName,
  batchName = "Unassigned Batch",
  courseName = "No active course",
  memberSince = "Recently",
  avatarUrl,
  liveClassId
}: WelcomeCardProps) {
  return (
    <Card className="bg-gradient-to-r from-primary/10 to-transparent border-primary/20 shadow-sm overflow-hidden">
      <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-center gap-6">
        <div className="h-24 w-24 rounded-full border-4 border-white shadow-md overflow-hidden bg-primary flex items-center justify-center text-3xl text-white font-bold">
          {avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={avatarUrl} alt={studentName} className="h-full w-full object-cover" />
          ) : (
            studentName.charAt(0).toUpperCase()
          )}
        </div>
        
        <div className="flex-1 text-center md:text-left space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-app-text">
            Welcome back, {studentName}! 👋
          </h2>
          <div className="flex flex-wrap justify-center md:justify-start gap-3 text-sm text-app-muted">
            <span className="bg-app-surface px-3 py-1 rounded-full border border-app-border">
              📚 {courseName}
            </span>
            <span className="bg-app-surface px-3 py-1 rounded-full border border-app-border">
              👥 {batchName}
            </span>
            <span className="bg-app-surface px-3 py-1 rounded-full border border-app-border">
              📅 Member since {memberSince}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 w-full md:w-auto">
          {liveClassId ? (
            <Link href={`/live-class/${liveClassId}`}>
              <Button className="w-full md:w-auto font-bold bg-secondary text-black hover:bg-secondary/90 shadow-md">
                <Play className="mr-2 h-4 w-4" />
                Join Live Class
              </Button>
            </Link>
          ) : (
            <Link href="/dashboard/student/schedule">
              <Button variant="outline" className="w-full md:w-auto font-bold border-primary text-primary hover:bg-primary/10">
                View Schedule
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
