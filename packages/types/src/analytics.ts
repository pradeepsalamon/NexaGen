import { z } from "zod";
import { paginationMetaSchema } from "./core-schemas";

// ──────────────────────────────────────────────────────────────
// Admin Analytics — shared contract
// ──────────────────────────────────────────────────────────────

export const analyticsRangePresetSchema = z.enum([
  "today",
  "yesterday",
  "last7",
  "last30",
  "thisMonth",
  "prevMonth",
  "thisYear",
  "prevYear",
  "custom"
]);
export type AnalyticsRangePreset = z.infer<typeof analyticsRangePresetSchema>;

export const analyticsCompareSchema = z.enum([
  "none",
  "prevPeriod",
  "prevMonth",
  "prevYear"
]);
export type AnalyticsCompare = z.infer<typeof analyticsCompareSchema>;

export const analyticsGranularitySchema = z.enum(["day", "week", "month"]);
export type AnalyticsGranularity = z.infer<typeof analyticsGranularitySchema>;

export const analyticsClassTypeSchema = z.enum(["all", "demo", "batch"]);
export type AnalyticsClassType = z.infer<typeof analyticsClassTypeSchema>;

/** Query params accepted by every analytics endpoint (all optional). */
export const analyticsRangeQuerySchema = z.object({
  preset: analyticsRangePresetSchema.optional(),
  from: z.string().optional(), // ISO date (yyyy-mm-dd) or datetime
  to: z.string().optional(),
  compare: analyticsCompareSchema.optional(),
  granularity: analyticsGranularitySchema.optional(),
  role: z.string().optional(),
  batchId: z.string().optional(),
  coachId: z.string().optional(),
  classType: analyticsClassTypeSchema.optional(),
  acquisitionSource: z.string().optional(),
  status: z.string().optional(),
  threshold: z.coerce.number().optional(), // low-attendance %, engagement inactivity days
  fresh: z.coerce.boolean().optional() // bypass the server cache
});
export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuerySchema>;

/** A single metric with an optional previous-period comparison. */
export const kpiValueSchema = z.object({
  value: z.number().nullable(),
  previous: z.number().nullable(),
  deltaPct: z.number().nullable(),
  /** true when there isn't enough history to trust `deltaPct` — UI hides the arrow */
  insufficientHistory: z.boolean(),
  /** free-form unit hint for the client formatter: "count" | "hours" | "percent" | "bytes" */
  unit: z.string().optional()
});
export type KpiValue = z.infer<typeof kpiValueSchema>;

export const timeSeriesPointSchema = z.object({
  date: z.string(), // ISO date, bucket start
  value: z.number(),
  /** optional secondary value (e.g. cumulative total alongside per-bucket count) */
  secondary: z.number().optional()
});
export type TimeSeriesPoint = z.infer<typeof timeSeriesPointSchema>;

export const timeSeriesSchema = z.object({
  granularity: analyticsGranularitySchema,
  points: z.array(timeSeriesPointSchema)
});
export type TimeSeries = z.infer<typeof timeSeriesSchema>;

export const categoryCountSchema = z.object({
  key: z.string(),
  label: z.string(),
  count: z.number(),
  percent: z.number()
});
export type CategoryCount = z.infer<typeof categoryCountSchema>;

export const analyticsMetaSchema = z.object({
  generatedAt: z.string(),
  timezone: z.string(),
  rangeStart: z.string(),
  rangeEnd: z.string(),
  compareStart: z.string().nullable(),
  compareEnd: z.string().nullable(),
  cached: z.boolean()
});
export type AnalyticsMeta = z.infer<typeof analyticsMetaSchema>;

// ── Executive overview ──

export const analyticsOverviewResponseSchema = z.object({
  meta: analyticsMetaSchema,
  kpis: z.object({
    totalUsers: kpiValueSchema,
    activeUsers: kpiValueSchema,
    newUsersThisMonth: kpiValueSchema,
    totalStudents: kpiValueSchema,
    totalCoaches: kpiValueSchema,
    activeCoaches: kpiValueSchema,
    activeBatches: kpiValueSchema,
    completedLiveClasses: kpiValueSchema,
    totalLiveClassHours: kpiValueSchema,
    demoClassesCompleted: kpiValueSchema,
    batchClassesCompleted: kpiValueSchema,
    totalRecordings: kpiValueSchema,
    recordingStorageUsedGb: kpiValueSchema,
    recordingStorageRemainingGb: kpiValueSchema,
    attendanceRate: kpiValueSchema,
    classesThisMonth: kpiValueSchema
  })
});
export type AnalyticsOverviewResponse = z.infer<
  typeof analyticsOverviewResponseSchema
>;

// ── Users ──

export const userAnalyticsResponseSchema = z.object({
  meta: analyticsMetaSchema,
  growth: timeSeriesSchema, // per-bucket new registrations + cumulative in `secondary`
  registrations: z.object({
    today: z.number(),
    thisWeek: z.number(),
    thisMonth: z.number(),
    prevMonth: z.number(),
    thisYear: z.number(),
    growthPercent: z.number().nullable()
  }),
  byRole: z.array(categoryCountSchema),
  byStatus: z.array(categoryCountSchema),
  totalUsers: z.number()
});
export type UserAnalyticsResponse = z.infer<typeof userAnalyticsResponseSchema>;

// ── Acquisition ──

export const acquisitionRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  users: z.number(),
  percent: z.number(),
  deltaPct: z.number().nullable()
});
export type AcquisitionRow = z.infer<typeof acquisitionRowSchema>;

export const acquisitionAnalyticsResponseSchema = z.object({
  meta: analyticsMetaSchema,
  sources: z.array(acquisitionRowSchema),
  knownCount: z.number(),
  unknownCount: z.number(),
  monthlyTrend: z.array(
    z.object({
      month: z.string(),
      bySource: z.array(z.object({ key: z.string(), count: z.number() }))
    })
  ),
  utmCampaigns: z.array(categoryCountSchema)
});
export type AcquisitionAnalyticsResponse = z.infer<
  typeof acquisitionAnalyticsResponseSchema
>;

// ── Students ──

export const studentRankRowSchema = z.object({
  studentId: z.string(),
  name: z.string(),
  batchName: z.string().nullable(),
  attendancePercent: z.number().nullable(),
  classesAttended: z.number(),
  classesMissed: z.number(),
  learningHours: z.number(),
  lastActiveAt: z.string().nullable(),
  lastAttendedAt: z.string().nullable()
});
export type StudentRankRow = z.infer<typeof studentRankRowSchema>;

export const studentAnalyticsResponseSchema = z.object({
  meta: analyticsMetaSchema,
  kpis: z.object({
    totalStudents: z.number(),
    activeStudents: z.number(),
    newStudents: z.number(),
    enrolledInBatch: z.number(),
    attendingClasses: z.number(),
    completedDemo: z.number(),
    convertedDemoToBatch: z.number(),
    noUpcomingClass: z.number(),
    poorAttendance: z.number(),
    inactiveForThreshold: z.number()
  }),
  inactivityThresholdDays: z.number(),
  lowAttendanceThreshold: z.number(),
  lowAttendanceStudents: z.array(studentRankRowSchema),
  mostEngaged: z.array(studentRankRowSchema)
});
export type StudentAnalyticsResponse = z.infer<
  typeof studentAnalyticsResponseSchema
>;

// ── Coaches ──

export const coachLeaderboardRowSchema = z.object({
  coachId: z.string(),
  name: z.string(),
  email: z.string(),
  isActive: z.boolean(),
  classesConducted: z.number(),
  completedClasses: z.number(),
  cancelledClasses: z.number(),
  teachingHours: z.number(),
  students: z.number(),
  avgAttendancePercent: z.number().nullable(),
  avgClassDurationMinutes: z.number().nullable()
});
export type CoachLeaderboardRow = z.infer<typeof coachLeaderboardRowSchema>;

export const coachAnalyticsResponseSchema = z.object({
  meta: analyticsMetaSchema,
  kpis: z.object({
    totalCoaches: z.number(),
    activeCoaches: z.number(),
    teachingThisMonth: z.number(),
    totalTeachingHours: z.number(),
    teachingHoursThisMonth: z.number(),
    teachingHoursThisWeek: z.number(),
    totalClassesConducted: z.number(),
    avgClassDurationMinutes: z.number().nullable(),
    avgAttendancePercent: z.number().nullable(),
    cancelledClasses: z.number()
  }),
  teachingHoursTrend: timeSeriesSchema,
  hoursByCoach: z.array(categoryCountSchema),
  hoursByClassType: z.array(categoryCountSchema),
  leaderboard: z.array(coachLeaderboardRowSchema)
});
export type CoachAnalyticsResponse = z.infer<
  typeof coachAnalyticsResponseSchema
>;

export const coachDetailAnalyticsResponseSchema = z.object({
  meta: analyticsMetaSchema,
  coach: coachLeaderboardRowSchema,
  teachingHoursTrend: timeSeriesSchema,
  hoursByBatch: z.array(categoryCountSchema),
  recentClasses: z.array(
    z.object({
      classId: z.string(),
      topic: z.string(),
      batchName: z.string().nullable(),
      date: z.string(),
      durationMinutes: z.number(),
      attendancePercent: z.number().nullable(),
      status: z.string()
    })
  )
});
export type CoachDetailAnalyticsResponse = z.infer<
  typeof coachDetailAnalyticsResponseSchema
>;

// ── Classes ──

export const classSegmentStatsSchema = z.object({
  scheduled: z.number(),
  completed: z.number(),
  cancelled: z.number(),
  noShow: z.number(),
  totalHours: z.number(),
  avgDurationMinutes: z.number().nullable(),
  attendanceRate: z.number().nullable()
});
export type ClassSegmentStats = z.infer<typeof classSegmentStatsSchema>;

export const classAnalyticsResponseSchema = z.object({
  meta: analyticsMetaSchema,
  demo: classSegmentStatsSchema,
  batch: classSegmentStatsSchema,
  overall: z.object({
    totalClasses: z.number(),
    completedClasses: z.number(),
    totalHours: z.number(),
    avgDurationMinutes: z.number().nullable(),
    avgStudentsPerClass: z.number().nullable(),
    attendanceRate: z.number().nullable()
  }),
  statusDistribution: z.array(categoryCountSchema),
  trend: timeSeriesSchema, // completed classes per bucket
  demoConversionPercent: z.number().nullable()
});
export type ClassAnalyticsResponse = z.infer<
  typeof classAnalyticsResponseSchema
>;

// ── Attendance ──

export const attendanceRankRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  sublabel: z.string().nullable(),
  attendancePercent: z.number().nullable(),
  expected: z.number(),
  attended: z.number(),
  classes: z.number()
});
export type AttendanceRankRow = z.infer<typeof attendanceRankRowSchema>;

export const attendanceAnalyticsResponseSchema = z.object({
  meta: analyticsMetaSchema,
  kpis: z.object({
    overallRate: z.number().nullable(),
    studentRate: z.number().nullable(),
    coachCompletionRate: z.number().nullable(),
    classesAttended: z.number(),
    classesMissed: z.number(),
    avgAttendanceDurationMinutes: z.number().nullable()
  }),
  trend: timeSeriesSchema,
  byBatch: z.array(attendanceRankRowSchema),
  byCoach: z.array(attendanceRankRowSchema),
  lowAttendanceThreshold: z.number(),
  lowAttendanceStudents: z.array(studentRankRowSchema)
});
export type AttendanceAnalyticsResponse = z.infer<
  typeof attendanceAnalyticsResponseSchema
>;

// ── Batches ──

export const batchAnalyticsRowSchema = z.object({
  batchId: z.string(),
  name: z.string(),
  status: z.string(),
  coachNames: z.array(z.string()),
  students: z.number(),
  classes: z.number(),
  completedClasses: z.number(),
  attendancePercent: z.number().nullable(),
  teachingHours: z.number()
});
export type BatchAnalyticsRow = z.infer<typeof batchAnalyticsRowSchema>;

export const batchAnalyticsResponseSchema = z.object({
  meta: analyticsMetaSchema,
  kpis: z.object({
    totalBatches: z.number(),
    activeBatches: z.number(),
    upcomingBatches: z.number(),
    completedBatches: z.number(),
    archivedBatches: z.number(),
    avgStudentsPerBatch: z.number().nullable()
  }),
  batches: z.array(batchAnalyticsRowSchema)
});
export type BatchAnalyticsResponse = z.infer<
  typeof batchAnalyticsResponseSchema
>;

export const batchDetailAnalyticsResponseSchema = z.object({
  meta: analyticsMetaSchema,
  batch: batchAnalyticsRowSchema,
  attendanceTrend: timeSeriesSchema,
  students: z.array(studentRankRowSchema)
});
export type BatchDetailAnalyticsResponse = z.infer<
  typeof batchDetailAnalyticsResponseSchema
>;

// ── Recordings ──

export const recordingAnalyticsResponseSchema = z.object({
  meta: analyticsMetaSchema,
  kpis: z.object({
    totalRecordings: z.number(),
    recordingsThisMonth: z.number(),
    totalDurationHours: z.number(),
    avgDurationMinutes: z.number().nullable(),
    totalSizeGb: z.number().nullable(),
    missingRecordings: z.number(),
    failedRecordings: z.number()
  }),
  byType: z.array(categoryCountSchema),
  byCoach: z.array(categoryCountSchema),
  byMonth: timeSeriesSchema,
  largest: z.array(
    z.object({
      classId: z.string(),
      topic: z.string(),
      coachName: z.string(),
      batchName: z.string().nullable(),
      sizeBytes: z.number().nullable(),
      durationSeconds: z.number().nullable(),
      createdAt: z.string(),
      status: z.string()
    })
  )
});
export type RecordingAnalyticsResponse = z.infer<
  typeof recordingAnalyticsResponseSchema
>;

// ── Storage ──

export const storageAnalyticsResponseSchema = z.object({
  meta: analyticsMetaSchema,
  available: z.boolean(), // false → "Data unavailable"
  usedBytes: z.number().nullable(),
  limitBytes: z.number().nullable(),
  remainingBytes: z.number().nullable(),
  usagePercent: z.number().nullable(),
  recordingBytes: z.number().nullable(),
  otherBytes: z.number().nullable(),
  recordingCount: z.number(),
  state: z.enum(["normal", "warning", "critical", "unknown"]),
  warningThresholdPercent: z.number(),
  criticalThresholdPercent: z.number(),
  growth: timeSeriesSchema, // used bytes per day
  forecast: z
    .object({
      avgMonthlyGrowthBytes: z.number(),
      daysUntilWarning: z.number().nullable(),
      daysUntilCritical: z.number().nullable(),
      daysUntilFull: z.number().nullable()
    })
    .nullable(), // null → not enough history
  largestFiles: z.array(
    z.object({
      classId: z.string(),
      topic: z.string(),
      sizeBytes: z.number(),
      createdAt: z.string()
    })
  )
});
export type StorageAnalyticsResponse = z.infer<
  typeof storageAnalyticsResponseSchema
>;

// ── Engagement ──

export const engagementAnalyticsResponseSchema = z.object({
  meta: analyticsMetaSchema,
  available: z.boolean(), // false while no activity data has accrued
  dau: z.number(),
  wau: z.number(),
  mau: z.number(),
  stickiness: z.number().nullable(), // dau/mau
  activeUsers: z.number(),
  inactiveUsers: z.number(),
  newVsReturning: z.object({ new: z.number(), returning: z.number() }),
  trend: timeSeriesSchema, // daily active users
  byEventType: z.array(categoryCountSchema),
  recentlyActive: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      role: z.string(),
      lastActiveAt: z.string().nullable()
    })
  )
});
export type EngagementAnalyticsResponse = z.infer<
  typeof engagementAnalyticsResponseSchema
>;

// ── Operations / Today ──

export const operationsResponseSchema = z.object({
  meta: analyticsMetaSchema,
  classesToday: z.number(),
  classesLiveNow: z.number(),
  classesCompletedToday: z.number(),
  classesCancelledToday: z.number(),
  classesNeedingAttention: z.number(),
  classesWithoutCoach: z.number(),
  recordingFailures: z.number(),
  missingRecordings: z.number(),
  unfinalizedAttendance: z.number(),
  storageState: z.enum(["normal", "warning", "critical", "unknown"])
});
export type OperationsResponse = z.infer<typeof operationsResponseSchema>;

export const todayClassRowSchema = z.object({
  classId: z.string(),
  time: z.string(),
  topic: z.string(),
  type: z.enum(["demo", "batch"]),
  batchName: z.string().nullable(),
  coachName: z.string(),
  studentCount: z.number(),
  status: z.string()
});
export type TodayClassRow = z.infer<typeof todayClassRowSchema>;

export const todayResponseSchema = z.object({
  meta: analyticsMetaSchema,
  classes: z.object({
    total: z.number(),
    upcoming: z.number(),
    live: z.number(),
    completed: z.number(),
    cancelled: z.number(),
    noShow: z.number()
  }),
  coaches: z.object({
    scheduled: z.number(),
    teaching: z.number(),
    completed: z.number(),
    absent: z.number()
  }),
  students: z.object({
    expected: z.number(),
    attended: z.number(),
    missed: z.number()
  }),
  schedule: z.array(todayClassRowSchema)
});
export type TodayResponse = z.infer<typeof todayResponseSchema>;

// ── Alerts ──

export const analyticsAlertSchema = z.object({
  kind: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string(),
  message: z.string(),
  count: z.number().nullable(),
  href: z.string().nullable()
});
export type AnalyticsAlert = z.infer<typeof analyticsAlertSchema>;

export const alertsResponseSchema = z.object({
  meta: analyticsMetaSchema,
  alerts: z.array(analyticsAlertSchema)
});
export type AlertsResponse = z.infer<typeof alertsResponseSchema>;

// ── Drill-down tables (paginated) ──

export const analyticsUserRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  status: z.string(),
  acquisitionSource: z.string(),
  createdAt: z.string(),
  lastActiveAt: z.string().nullable(),
  batchNames: z.array(z.string())
});
export type AnalyticsUserRow = z.infer<typeof analyticsUserRowSchema>;

export const analyticsUsersTableResponseSchema = z.object({
  rows: z.array(analyticsUserRowSchema),
  pagination: paginationMetaSchema
});
export type AnalyticsUsersTableResponse = z.infer<
  typeof analyticsUsersTableResponseSchema
>;

export const analyticsClassRowSchema = z.object({
  id: z.string(),
  date: z.string(),
  time: z.string(),
  type: z.enum(["demo", "batch"]),
  topic: z.string(),
  coachName: z.string(),
  batchName: z.string().nullable(),
  students: z.number(),
  durationMinutes: z.number(),
  status: z.string(),
  hasRecording: z.boolean(),
  attendancePercent: z.number().nullable()
});
export type AnalyticsClassRow = z.infer<typeof analyticsClassRowSchema>;

export const analyticsClassesTableResponseSchema = z.object({
  rows: z.array(analyticsClassRowSchema),
  pagination: paginationMetaSchema
});
export type AnalyticsClassesTableResponse = z.infer<
  typeof analyticsClassesTableResponseSchema
>;

export const analyticsRecordingRowSchema = z.object({
  classId: z.string(),
  topic: z.string(),
  coachName: z.string(),
  batchName: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  sizeBytes: z.number().nullable(),
  createdAt: z.string(),
  status: z.string()
});
export type AnalyticsRecordingRow = z.infer<typeof analyticsRecordingRowSchema>;

export const analyticsRecordingsTableResponseSchema = z.object({
  rows: z.array(analyticsRecordingRowSchema),
  pagination: paginationMetaSchema
});
export type AnalyticsRecordingsTableResponse = z.infer<
  typeof analyticsRecordingsTableResponseSchema
>;

export const analyticsCoachesTableResponseSchema = z.object({
  rows: z.array(coachLeaderboardRowSchema),
  pagination: paginationMetaSchema
});
export type AnalyticsCoachesTableResponse = z.infer<
  typeof analyticsCoachesTableResponseSchema
>;

export const analyticsBatchesTableResponseSchema = z.object({
  rows: z.array(batchAnalyticsRowSchema),
  pagination: paginationMetaSchema
});
export type AnalyticsBatchesTableResponse = z.infer<
  typeof analyticsBatchesTableResponseSchema
>;

/** `report` path param for GET /analytics/export/:report */
export const analyticsExportReportSchema = z.enum([
  "users",
  "acquisition",
  "coaches",
  "batches",
  "classes",
  "attendance",
  "recordings",
  "storage"
]);
export type AnalyticsExportReport = z.infer<typeof analyticsExportReportSchema>;
