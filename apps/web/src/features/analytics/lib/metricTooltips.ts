/** The exact calculation behind each KPI, surfaced in "How is this calculated?" tooltips. */
export const METRIC_TOOLTIPS = {
  totalUsers: "Every non-deleted user account, across all roles.",
  activeUsers:
    "Distinct users with a recorded activity event (login, class join, assignment attempt, recording watch) OR a lastActiveAt timestamp inside the selected period.",
  newUsersThisMonth:
    "Users whose account was created within the current calendar month (business timezone).",
  totalStudents: "Non-deleted users with the STUDENT role.",
  totalCoaches: "Non-deleted users with the COACH role.",
  activeCoaches: "Coaches whose account status is ACTIVE (approved).",
  activeBatches: "Batches with status ACTIVE.",
  completedLiveClasses:
    "Classes whose status is COMPLETED (set when the class ends) with a start time in the selected period.",
  totalLiveClassHours:
    "Sum of each completed class's actual run length (live-session start → end), falling back to the scheduled window when the session has no recorded times. One live session per class — never double-counted.",
  demoClassesCompleted: "Completed classes flagged isDemo = true in the period.",
  batchClassesCompleted: "Completed classes attached to a batch (isDemo = false) in the period.",
  totalRecordings: "Live sessions with a stored recording URL.",
  recordingStorageUsedGb:
    "Bytes currently consumed by files in the recordings directory, from a live filesystem scan.",
  recordingStorageRemainingGb:
    "Configured storage limit (RECORDING_STORAGE_LIMIT_GB) minus current usage.",
  attendanceRate:
    "Attended attendance rows (status PRESENT or LATE) ÷ all expected rows, over COMPLETED classes only. Cancelled classes create no expectation.",
  classesThisMonth: "All classes with a start time in the current calendar month.",
  coachTeachingHours:
    "Sum of CoachAttendance.totalDuration (recomputed from join/leave logs at class end) for the coach's COMPLETED classes, falling back to the class's actual run length when no attendance row exists.",
  dau: "Distinct users with ≥1 activity event in the trailing 24 hours.",
  wau: "Distinct users with ≥1 activity event in the trailing 7 days.",
  mau: "Distinct users with ≥1 activity event in the trailing 30 days.",
  storageForecast:
    "Least-squares linear fit of daily storage snapshots projected to each threshold. Requires ≥14 days of history and positive growth."
} as const;

export type MetricKey = keyof typeof METRIC_TOOLTIPS;
