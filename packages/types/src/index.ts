import { z } from "zod";

export * from "./api-endpoints";

export type UserRole = "SUPER_ADMIN" | "ADMIN" | "COACH" | "STUDENT";

export type UserStatus = "ACTIVE" | "PENDING" | "ARCHIVED" | "DELETED";

export type CoachTitle = "NONE" | "CM" | "FM" | "IM" | "GM";

export type BatchStatus = "UPCOMING" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

export const experienceLevelSchema = z.enum([
  "beginner",
  "intermediate",
  "advanced"
]);

export const prismaExperienceLevelSchema = z.enum([
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED"
]);

export const coachTitleSchema = z.enum(["NONE", "CM", "FM", "IM", "GM"]);

export const batchStatusSchema = z.enum(["UPCOMING", "ACTIVE", "COMPLETED", "ARCHIVED"]);

export const userStatusSchema = z.enum(["ACTIVE", "PENDING", "ARCHIVED", "DELETED"]);

export const userRoleSchema = z.enum(["SUPER_ADMIN", "ADMIN", "COACH", "STUDENT"]);
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: "Password must include at least one letter and one number."
  });

export const registerRequestSchema = z
  .object({
    confirmPassword: z.string().min(8, "Confirm your password."),
    contactNumber: z.string().min(1, "Contact number is required.").max(30),
    email: z.string().email("Enter a valid email address.").max(255),
    experienceLevel: experienceLevelSchema,
    parentName: z.string().min(1, "Parent name is required.").max(120),
    password: passwordSchema,
    studentAge: z
      .string()
      .regex(/^\d+$/, "Student age must be a number."),
    studentName: z.string().min(1, "Student name is required.").max(120)
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"]
  });

export const loginRequestSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
  rememberMe: z.boolean().optional()
});

export const forgotPasswordRequestSchema = z.object({
  email: z.string().email("Enter a valid email address.")
});

export const resetPasswordRequestSchema = z
  .object({
    confirmPassword: z.string().min(8, "Confirm your password."),
    password: passwordSchema,
    token: z.string().min(1, "Reset token is required.")
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"]
  });

export const updateProfileRequestSchema = z.object({
  avatarUrl: z.string().url("Enter a valid image URL.").optional(),
  coachProfile: z
    .object({
      bio: z.string().max(2000).optional(),
      fideId: z.string().max(80).optional(),
      fideRating: z.number().int().min(0).max(4000).optional(),
      hourlyRate: z.string().max(20).optional(),
      qualification: z.string().max(255).optional(),
      specialization: z.string().max(255).optional(),
      title: coachTitleSchema.optional(),
      yearsOfExperience: z.number().int().min(0).max(80).optional()
    })
    .optional(),
  email: z.string().email("Enter a valid email address.").max(255),
  firstName: z.string().min(1, "First name is required.").max(120),
  lastName: z.string().max(120).optional(),
  phoneNumber: z.string().max(30).optional(),
  studentProfile: z
    .object({
      chessRating: z.number().int().min(0).max(4000).optional(),
      dateOfBirth: z.string().optional(),
      experienceLevel: prismaExperienceLevelSchema.optional(),
      fideId: z.string().max(80).optional(),
      parentEmail: z.string().email("Enter a valid parent email.").optional(),
      parentName: z.string().min(1).max(120).optional(),
      parentPhone: z.string().max(30).optional(),
      parentRelationship: z.string().max(80).optional()
    })
    .optional(),
  timezone: z.string().max(80).optional(),
  username: z.string().max(80).optional()
});

const batchUserIdsSchema = z
  .array(z.string().min(1))
  .max(100, "A batch can include up to 100 users per role.")
  .optional()
  .default([]);

const batchDateRefinement = (value: { startsAt?: string; endsAt?: string }) => {
  if (!value.startsAt || !value.endsAt) {
    return true;
  }
  return new Date(value.startsAt).getTime() <= new Date(value.endsAt).getTime();
};

const batchDateRefinementOptions = { message: "End date must be after start date.", path: ["endsAt"] };

const createBatchRequestBaseSchema = z.object({
  coachIds: batchUserIdsSchema,
  description: z.string().max(2000).optional(),
  endsAt: z.string().optional(),
  name: z.string().min(1, "Batch name is required.").max(120),
  scheduleNotes: z.string().max(1000).optional(),
  startsAt: z.string().optional(),
  status: batchStatusSchema.optional().default("ACTIVE"),
  studentIds: batchUserIdsSchema
});

export const createBatchRequestSchema = createBatchRequestBaseSchema.refine(
  batchDateRefinement,
  batchDateRefinementOptions
);

export const updateBatchRequestSchema = createBatchRequestBaseSchema.partial().refine(
  batchDateRefinement,
  batchDateRefinementOptions
);

export const createUserRequestSchema = z.object({
  email: z.string().email("Enter a valid email address.").max(255),
  firstName: z.string().min(1, "First name is required.").max(120),
  lastName: z.string().max(120).optional(),
  password: passwordSchema,
  role: userRoleSchema.optional().default("STUDENT"),
  status: userStatusSchema.optional().default("ACTIVE")
});

export const updateUserRequestSchema = createUserRequestSchema.partial();

export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;

export type PrismaExperienceLevel = z.infer<typeof prismaExperienceLevelSchema>;

export type AuthStudentProfile = {
  chessRating?: number | null;
  dateOfBirth?: string | null;
  experienceLevel: PrismaExperienceLevel;
  fideId?: string | null;
  parentEmail?: string | null;
  parentName: string;
  parentPhone?: string | null;
  parentRelationship?: string | null;
};

export type AuthCoachProfile = {
  bio?: string | null;
  fideId?: string | null;
  fideRating?: number | null;
  hourlyRate?: string | null;
  qualification?: string | null;
  specialization?: string | null;
  title: CoachTitle;
  yearsOfExperience?: number | null;
};

export type AuthUser = {
  avatarUrl?: string | null;
  coachProfile?: AuthCoachProfile | null;
  email: string;
  firstName: string;
  id: string;
  isEmailVerified: boolean;
  lastName?: string | null;
  phoneNumber?: string | null;
  role: UserRole;
  status: UserStatus;
  studentProfile?: AuthStudentProfile | null;
  timezone?: string;
  username?: string | null;
};

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export type CreateBatchRequest = z.infer<typeof createBatchRequestSchema>;

export type UpdateBatchRequest = z.infer<typeof updateBatchRequestSchema>;

export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export type BatchUserSummary = {
  email: string;
  firstName: string;
  id: string;
  lastName?: string | null;
  role: UserRole;
};

export type Batch = {
  coachCount: number;
  coaches: BatchUserSummary[];
  createdAt: string;
  description?: string | null;
  endsAt?: string | null;
  id: string;
  name: string;
  scheduleNotes?: string | null;
  startsAt?: string | null;
  status: BatchStatus;
  studentCount: number;
  students: BatchUserSummary[];
  updatedAt: string;
};

export type BatchAssignableUsersResponse = {
  coaches: BatchUserSummary[];
  students: BatchUserSummary[];
};

export type BatchListResponse = {
  batches: Batch[];
};

export type BatchResponse = {
  batch: Batch;
};

export type AuthResponse = {
  user: AuthUser;
};

export type UserListResponse = {
  users: AuthUser[];
};

export type UserResponse = {
  user: AuthUser;
};

export type RefreshSessionResponse = AuthResponse;

export type LogoutResponse = {
  ok: true;
};

export type ForgotPasswordResponse = {
  ok: true;
  resetToken?: string;
};

export type MessageResponse = {
  message: string;
};

export type TrashEntity =
  | "User"
  | "StudentProfile"
  | "CoachProfile"
  | "Batch"
  | "BatchCoach"
  | "BatchStudent";

export type TrashDeletedBy = {
  email: string;
  firstName: string;
  id: string;
  lastName?: string | null;
  role: UserRole;
};

export type TrashItem = {
  daysUntilPermanentDeletion: number | null;
  deletedAt: string | null;
  deletedBy: TrashDeletedBy | null;
  entity: TrashEntity;
  id: string;
  title: string;
};

export type TrashListRequest = {
  deletedById?: string;
  deletedFrom?: string;
  deletedTo?: string;
  entity?: TrashEntity | "ALL";
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: "entity" | "title" | "deletedAt" | "deletedBy";
  sortOrder?: "asc" | "desc";
};

export type TrashListResponse = {
  items: TrashItem[];
  page: number;
  pageSize: number;
  retentionDays: number;
  total: number;
};

export type TrashBulkActionRequest = {
  items: Array<{
    entity: TrashEntity;
    id: string;
  }>;
};

export type TrashActionResponse = {
  ok: true;
};

export type EmptyTrashResponse = TrashActionResponse & {
  deletedCount: number;
};


export const registerCoachRequestSchema = z
  .object({
    confirmPassword: z.string().min(8, "Confirm your password."),
    contactNumber: z.string().min(1, "Contact number is required.").max(30),
    email: z.string().email("Enter a valid email address.").max(255),
    coachName: z.string().min(1, "Coach name is required.").max(120),
    password: passwordSchema,
    title: coachTitleSchema.optional().default("NONE"),
    fideId: z.string().max(80).optional(),
    fideRating: z.number().int().min(0).max(4000).optional(),
    yearsOfExperience: z.number().int().min(0).max(80).optional()
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"]
  });

export const verifyEmailRequestSchema = z.object({
  token: z.string().min(1, "Verification token is required.")
});

export type RegisterCoachRequest = z.infer<typeof registerCoachRequestSchema>;
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export type PendingCoach = {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  createdAt: string;
  coachProfile: AuthCoachProfile;
};

export type PendingCoachesResponse = {
  coaches: PendingCoach[];
};

export type UpdateCoachStatusRequest = {
  status: "ACTIVE" | "ARCHIVED" | "DELETED";
};

//
// COACH DASHBOARD TYPES
//

export const classStatusSchema = z.enum(["SCHEDULED", "IN_PROGRESS", "LIVE", "COMPLETED", "CANCELLED"]);
export type ClassStatus = z.infer<typeof classStatusSchema>;

export type CoachClass = {
  id: string;
  batchId: string;
  batchName: string;
  coachId: string;
  title: string | null;
  topic: string | null;
  description: string | null;
  objectives: string | null;
  homework: string | null;
  notes: string | null;
  status: ClassStatus;
  startsAt: string;
  endsAt: string;
  meetingRoomId: string | null;
  createdAt: string;
  studentCount: number;
  hasRecording?: boolean;
};

export type CoachDashboardResponse = {
  batchCount: number;
  studentCount: number;
  todayClasses: number;
  upcomingClasses: number;
  completedClasses: number;
};

export type CoachBatch = {
  id: string;
  name: string;
  status: BatchStatus;
  scheduleNotes: string | null;
  studentCount: number;
  nextClass: string | null;
};

export type CoachBatchesResponse = {
  batches: CoachBatch[];
};

export type CoachClassListResponse = {
  classes: CoachClass[];
};

export type CoachClassResponse = {
  class: CoachClass;
};

export type CoachClassDetails = CoachClass & {
  actualStartsAt: string | null;
  actualEndsAt: string | null;
  participants: {
    name: string;
    joinedAt: string;
  }[];
};

export type CoachClassDetailsResponse = {
  class: CoachClassDetails;
};

export type CoachStudent = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  status: UserStatus;
  batches: Array<{ id: string; name: string }>;
  chessRating: number | null;
};

export type CoachStudentsResponse = {
  students: CoachStudent[];
};

const classDateRefinement = (value: { startsAt: string; endsAt: string }) => {
  return new Date(value.startsAt).getTime() <= new Date(value.endsAt).getTime();
};
const classDateRefinementOptions = { message: "End time must be after start time.", path: ["endsAt"] };

const createClassRequestBaseSchema = z.object({
  batchId: z.string().min(1, "Batch is required."),
  title: z.string().max(120).optional(),
  topic: z.string().min(1, "Topic is required.").max(120),
  description: z.string().max(2000).optional(),
  objectives: z.string().max(2000).optional(),
  homework: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  startsAt: z.string(),
  endsAt: z.string()
});

export const createClassRequestSchema = createClassRequestBaseSchema.refine(classDateRefinement, classDateRefinementOptions);

export type CreateClassRequest = z.infer<typeof createClassRequestSchema>;

export const updateClassRequestSchema = createClassRequestBaseSchema.partial().refine((val) => {
  if (val.startsAt && val.endsAt) {
    return classDateRefinement({ startsAt: val.startsAt, endsAt: val.endsAt });
  }
  return true;
}, classDateRefinementOptions);

export type UpdateClassRequest = z.infer<typeof updateClassRequestSchema>;

// -- STUDENT ATTENDANCE TYPES --

export const attendanceStatusEnum = z.enum(["PRESENT", "LATE", "PARTIAL", "ABSENT"]);
export type AttendanceStatusType = z.infer<typeof attendanceStatusEnum>;

export const attendanceEventTypeEnum = z.enum(["JOIN", "LEAVE", "DISCONNECT", "RECONNECT"]);
export type AttendanceEventTypeType = z.infer<typeof attendanceEventTypeEnum>;

export const studentAttendanceHistorySchema = z.object({
  id: z.string(),
  topic: z.string(),
  batchName: z.string(),
  coachName: z.string(),
  date: z.string(),
  status: attendanceStatusEnum,
  joinedAt: z.string().nullable(),
  leftAt: z.string().nullable(),
  scheduledDuration: z.number(),
  actualDuration: z.number(),
  attendancePercent: z.number(),
  reconnectCount: z.number(),
  logCount: z.number(),
});

export const studentAttendanceStatsSchema = z.object({
  total: z.number(),
  attended: z.number(),
  missed: z.number(),
  percentage: z.number(),
  totalLearningHours: z.number(),
  currentStreak: z.number(),
  longestStreak: z.number(),
  monthlyPercent: z.number(),
  weeklyPercent: z.number(),
});

export const studentAttendanceResponseSchema = z.object({
  stats: studentAttendanceStatsSchema,
  history: z.array(studentAttendanceHistorySchema),
});

export type StudentAttendanceHistory = z.infer<typeof studentAttendanceHistorySchema>;
export type StudentAttendanceStats = z.infer<typeof studentAttendanceStatsSchema>;
export type StudentAttendanceResponse = z.infer<typeof studentAttendanceResponseSchema>;

// -- ATTENDANCE LOG TYPES --

export const attendanceLogEntrySchema = z.object({
  id: z.string(),
  eventType: attendanceEventTypeEnum,
  timestamp: z.string(),
  sessionStart: z.string().nullable(),
  sessionEnd: z.string().nullable(),
  sessionDuration: z.number().nullable(),
  reason: z.string().nullable(),
  source: z.string(),
});

export const attendanceLogsResponseSchema = z.object({
  classId: z.string(),
  studentId: z.string(),
  status: attendanceStatusEnum,
  totalDuration: z.number().nullable(),
  attendancePercent: z.number().nullable(),
  reconnectCount: z.number(),
  joinedAt: z.string().nullable(),
  leftAt: z.string().nullable(),
  scheduledDuration: z.number(),
  totalInterruptions: z.number(),
  longestInterruption: z.number(),
  totalDowntime: z.number(),
  logs: z.array(attendanceLogEntrySchema),
});

export type AttendanceLogEntry = z.infer<typeof attendanceLogEntrySchema>;
export type AttendanceLogsResponse = z.infer<typeof attendanceLogsResponseSchema>;

// -- CLASS ATTENDANCE REPORT TYPES --

export const classAttendanceStudentSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  joinedAt: z.string().nullable(),
  leftAt: z.string().nullable(),
  duration: z.number(),
  attendancePercent: z.number(),
  reconnectCount: z.number(),
  logCount: z.number(),
});

export const classAttendanceReportSchema = z.object({
  classId: z.string(),
  topic: z.string(),
  batchName: z.string(),
  coachName: z.string(),
  scheduledStart: z.string(),
  scheduledEnd: z.string(),
  actualStart: z.string().nullable(),
  actualEnd: z.string().nullable(),
  scheduledDuration: z.number(),
  status: z.string(),
  totalStudents: z.number(),
  presentCount: z.number(),
  absentCount: z.number(),
  lateCount: z.number(),
  partialCount: z.number(),
  overallPercent: z.number(),
  students: z.array(classAttendanceStudentSchema),
});

export type ClassAttendanceStudent = z.infer<typeof classAttendanceStudentSchema>;
export type ClassAttendanceReport = z.infer<typeof classAttendanceReportSchema>;

// -- COACH TEACHING STATS TYPES --

export const coachTeachingStatsSchema = z.object({
  totalClasses: z.number(),
  completedClasses: z.number(),
  cancelledClasses: z.number(),
  totalTeachingHours: z.number(),
  avgSessionMinutes: z.number(),
  lateStarts: z.number(),
  earlyExits: z.number(),
  monthlyClasses: z.number(),
});

export const coachTeachingHistorySchema = z.object({
  id: z.string(),
  topic: z.string(),
  batchName: z.string(),
  date: z.string(),
  scheduledStart: z.string(),
  scheduledEnd: z.string(),
  actualStart: z.string().nullable(),
  actualEnd: z.string().nullable(),
  teachingDuration: z.number(),
  coachTotalDuration: z.number().optional(),
  boardDuration: z.number().optional(),
  studentsPresent: z.number(),
  totalStudents: z.number(),
  attendancePercent: z.number(),
});

export const coachTeachingResponseSchema = z.object({
  stats: coachTeachingStatsSchema,
  history: z.array(coachTeachingHistorySchema),
});

export type CoachTeachingStats = z.infer<typeof coachTeachingStatsSchema>;
export type CoachTeachingHistory = z.infer<typeof coachTeachingHistorySchema>;
export type CoachTeachingResponse = z.infer<typeof coachTeachingResponseSchema>;

// -- ADMIN ATTENDANCE DASHBOARD TYPES --

export const adminAttendanceTodaySchema = z.object({
  totalClasses: z.number(),
  liveClasses: z.number(),
  studentsPresent: z.number(),
  studentsAbsent: z.number(),
  totalStudents: z.number(),
  totalCoaches: z.number(),
});

export const adminAttendanceMonthlyTrendSchema = z.object({
  month: z.string(),
  classes: z.number(),
  attended: z.number(),
  total: z.number(),
  percent: z.number(),
});

export const adminAttendanceDashboardSchema = z.object({
  today: adminAttendanceTodaySchema,
  overall: z.object({
    completedClasses: z.number(),
    totalAttendanceRecords: z.number(),
  }),
  monthlyTrend: z.array(adminAttendanceMonthlyTrendSchema),
});

export type AdminAttendanceToday = z.infer<typeof adminAttendanceTodaySchema>;
export type AdminAttendanceMonthlyTrend = z.infer<typeof adminAttendanceMonthlyTrendSchema>;
export type AdminAttendanceDashboard = z.infer<typeof adminAttendanceDashboardSchema>;

// -- LIVE CLASS MONITORING TYPES --

export const liveMonitoringStudentSchema = z.object({
  id: z.string(),
  name: z.string(),
  isOnline: z.boolean(),
  joinedAt: z.string().nullable(),
  lastActivity: z.string().nullable(),
  reconnectCount: z.number(),
  status: z.string(),
});

export const liveClassMonitoringSchema = z.object({
  classId: z.string(),
  isLive: z.boolean(),
  startedAt: z.string().nullable(),
  totalEnrolled: z.number(),
  onlineCount: z.number(),
  offlineCount: z.number(),
  students: z.array(liveMonitoringStudentSchema),
});

export type LiveMonitoringStudent = z.infer<typeof liveMonitoringStudentSchema>;
export type LiveClassMonitoring = z.infer<typeof liveClassMonitoringSchema>;

// -- ATTENDANCE POLICY TYPES --

export const attendancePolicySchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  presentThreshold: z.number(),
  lateThreshold: z.number(),
  partialThreshold: z.number(),
  gracePeriodMinutes: z.number(),
  minDurationMinutes: z.number(),
  reconnectTolerance: z.number(),
});

export const updateAttendancePolicySchema = z.object({
  presentThreshold: z.number().min(0).max(100).optional(),
  lateThreshold: z.number().min(0).max(100).optional(),
  partialThreshold: z.number().min(0).max(100).optional(),
  gracePeriodMinutes: z.number().min(0).optional(),
  minDurationMinutes: z.number().min(0).optional(),
  reconnectTolerance: z.number().min(0).optional(),
});

export type AttendancePolicy = z.infer<typeof attendancePolicySchema>;
export type UpdateAttendancePolicy = z.infer<typeof updateAttendancePolicySchema>;


// -- DEMO CLASS TYPES --

export const createDemoClassRequestSchema = z.object({
  coachId: z.string().cuid(),
  topic: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime()
}).refine((value) => new Date(value.startsAt).getTime() <= new Date(value.endsAt).getTime(), {
  message: "End time must be after start time.",
  path: ["endsAt"]
});

export const updateDemoClassRequestSchema = z.object({
  coachId: z.string().cuid().optional(),
  topic: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional()
}).refine((value) => {
  if (value.startsAt && value.endsAt) {
    return new Date(value.startsAt).getTime() <= new Date(value.endsAt).getTime();
  }
  return true;
}, {
  message: "End time must be after start time.",
  path: ["endsAt"]
});

export const guestJoinDemoRequestSchema = z.object({
  guestName: z.string().min(1, "Name is required").max(50)
});

export const guestJoinDemoResponseSchema = z.object({
  token: z.string(),
  roomName: z.string(),
  topic: z.string()
});

export const demoClassSchema = z.object({
  id: z.string(),
  topic: z.string(),
  description: z.string().nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: z.enum(["SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"]),
  coachName: z.string()
});

export const listDemoClassesResponseSchema = z.object({
  classes: z.array(demoClassSchema)
});

export const demoClassDetailsSchema = demoClassSchema.extend({
  actualStartsAt: z.string().datetime().nullable(),
  actualEndsAt: z.string().datetime().nullable(),
  participants: z.array(z.object({
    name: z.string(),
    joinedAt: z.string().datetime()
  }))
});

export const demoClassDetailsResponseSchema = z.object({
  class: demoClassDetailsSchema
});

export type CreateDemoClassRequest = z.infer<typeof createDemoClassRequestSchema>;
export type UpdateDemoClassRequest = z.infer<typeof updateDemoClassRequestSchema>;
export type GuestJoinDemoRequest = z.infer<typeof guestJoinDemoRequestSchema>;
export type GuestJoinDemoResponse = z.infer<typeof guestJoinDemoResponseSchema>;
export type DemoClass = z.infer<typeof demoClassSchema>;
export type ListDemoClassesResponse = z.infer<typeof listDemoClassesResponseSchema>;
export type DemoClassDetails = z.infer<typeof demoClassDetailsSchema>;
export type DemoClassDetailsResponse = z.infer<typeof demoClassDetailsResponseSchema>;

export type AdminBatchClass = CoachClass & {
  coachName: string;
  hasRecording?: boolean;
};

export type AdminBatchClassDetails = AdminBatchClass & {
  actualStartsAt: string | null;
  actualEndsAt: string | null;
  participants: {
    name: string;
    joinedAt: string;
  }[];
};

export type ListAdminBatchClassesResponse = {
  classes: AdminBatchClass[];
};

export type AdminBatchClassDetailsResponse = {
  class: AdminBatchClassDetails;
};
