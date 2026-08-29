"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PlayCircle, Clock } from "lucide-react";
import Link from "next/link";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";

interface CourseProgress {
  id: string;
  title: string;
  module: string;
  progressPercent: number;
  lastOpenedAt: string;
}

interface ContinueLearningProps {
  courses?: CourseProgress[];
}

export function ContinueLearning({ courses = [] }: ContinueLearningProps) {
  const timeZone = useUserTimeZone();

  if (courses.length === 0) {
    return (
      <Card className="border-app-border bg-app-surface shadow-sm h-full">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold">Continue Learning</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center text-center py-12">
          <PlayCircle className="h-10 w-10 text-app-border mb-3" />
          <p className="text-app-text font-medium">Your learning activity will appear here.</p>
          <p className="text-sm text-app-muted mt-1">Enroll in a course to get started.</p>
          <Link href="/student/courses" className="mt-4">
            <Button variant="outline" className="font-semibold">Browse Courses</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-app-border bg-app-surface shadow-sm h-full">
      <CardHeader className="pb-4 border-b border-app-border/50">
        <CardTitle className="text-lg font-semibold">Continue Learning</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-app-border/50">
          {courses.map((course) => (
            <div key={course.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-app-background/50 transition-colors">
              <div className="flex-1 space-y-3">
                <div>
                  <h4 className="font-semibold text-app-text">{course.title}</h4>
                  <p className="text-sm text-app-muted flex items-center gap-2 mt-1">
                    <span className="bg-app-background px-2 py-0.5 rounded text-xs border border-app-border font-medium">
                      {course.module}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {formatFullDate(course.lastOpenedAt, timeZone)}
                    </span>
                  </p>
                </div>
                
                {/* Progress bar */}
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 bg-app-background border border-app-border rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full transition-all duration-500" 
                      style={{ width: `${course.progressPercent}%` }} 
                    />
                  </div>
                  <span className="text-xs font-bold text-app-text w-9">{course.progressPercent}%</span>
                </div>
              </div>
              
              <Link href={`/student/courses/${course.id}`}>
                <Button size="sm" className="w-full md:w-auto font-bold bg-primary text-white shadow-sm hover:opacity-90">
                  <PlayCircle className="h-4 w-4 mr-1.5" />
                  Continue
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

