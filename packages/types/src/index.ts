import { z } from "zod";

import {
  liveClassSettingsOverrideSchema,
  type LiveClassSettings,
  type LiveClassSettingsOverride
} from "./live-class-settings";
import { messagingEventSchema, type MessagingEvent } from "./messaging";
import {
  chessAppearanceOverrideSchema,
  type BoardThemeMeta,
  type ChessAppearance,
  type ChessAppearanceOverride,
  type PieceSetMeta,
  type SoundThemeMeta
} from "./chess-appearance";

export * from "./api-endpoints";
export * from "./live-class-settings";
export * from "./live-class-moderation";
export * from "./live-class-screen-share";
export * from "./chess-appearance";

// ──────────────────────────────────────────────
// Pagination (AUDIT H26)
// ──────────────────────────────────────────────

/** Query params accepted by server-paginated list endpoints. */
export interface PaginatedQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const paginationMetaSchema = z.object({
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number()
});

export type UserRole = "SUPER_ADMIN" | "ADMIN" | "COACH" | "STUDENT";

export type UserStatus = "ACTIVE" | "PENDING" | "ARCHIVED" | "DELETED";

export type CoachTitle = "NONE" | "CM" | "FM" | "IM" | "GM";

export type BatchStatus = "UPCOMING" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

export const referralSourceSchema = z.enum([
  "ads",
  "friend",
  "school",
  "other"
]);

export const experienceLevelSchema = z.enum([
  "beginner",
  "intermediate",
  "advanced"
]);

export const prismaReferralSourceSchema = z.enum([
  "ADS",
  "FRIEND",
  "SCHOOL",
  "OTHER"
]);

export const prismaExperienceLevelSchema = z.enum([
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED"
]);

// ── Acquisition attribution ──
// Lowercase slugs on the wire; the API maps them to the Prisma `AcquisitionSource`
// enum. `unknown` is explicit and always valid — the UI never forces a guess.
export const acquisitionSourceSchema = z.enum([
  "website",
  "google",
  "instagram",
  "facebook",
  "youtube",
  "whatsapp",
  "referral",
  "school",
  "coach_referral",
  "advertisement",
  "other",
  "unknown"
]);

export const prismaAcquisitionSourceSchema = z.enum([
  "WEBSITE",
  "GOOGLE",
  "INSTAGRAM",
  "FACEBOOK",
  "YOUTUBE",
  "WHATSAPP",
  "REFERRAL",
  "SCHOOL",
  "COACH_REFERRAL",
  "ADVERTISEMENT",
  "OTHER",
  "UNKNOWN"
]);

/** First-touch acquisition data captured at registration (all optional). */
export const acquisitionCaptureSchema = z.object({
  acquisitionSource: acquisitionSourceSchema.optional(),
  acquisitionDetail: z.string().max(200).optional(),
  utmSource: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
  utmContent: z.string().max(200).optional(),
  utmTerm: z.string().max(200).optional(),
  landingReferrer: z.string().max(500).optional()
});

export type AcquisitionSourceValue = z.infer<typeof acquisitionSourceSchema>;
export type PrismaAcquisitionSource = z.infer<
  typeof prismaAcquisitionSourceSchema
>;
export type AcquisitionCapture = z.infer<typeof acquisitionCaptureSchema>;

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
    // Legacy field — kept optional for older clients. New clients send
    // `acquisitionSource` (+ optional detail / UTM) instead.
    referralSource: referralSourceSchema.optional(),
    acquisitionSource: acquisitionSourceSchema.optional(),
    acquisitionDetail: z.string().max(200).optional(),
    utmSource: z.string().max(200).optional(),
    utmMedium: z.string().max(200).optional(),
    utmCampaign: z.string().max(200).optional(),
    utmContent: z.string().max(200).optional(),
    utmTerm: z.string().max(200).optional(),
    landingReferrer: z.string().max(500).optional(),
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
      referralSource: prismaReferralSourceSchema.optional(),
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

export type ReferralSource = z.infer<typeof referralSourceSchema>;

export type PrismaReferralSource = z.infer<typeof prismaReferralSourceSchema>;

export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;

export type PrismaExperienceLevel = z.infer<typeof prismaExperienceLevelSchema>;

export type AuthStudentProfile = {
  chessRating?: number | null;
  dateOfBirth?: string | null;
  experienceLevel: PrismaExperienceLevel;
  referralSource: PrismaReferralSource;
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
  pagination?: PaginationMeta;
};

export type BatchResponse = {
  batch: Batch;
};

export type AuthResponse = {
  user: AuthUser;
};

/**
 * Coach self-registration does NOT create a session: the account is created
 * with `status: PENDING` and `coachProfile.approvalStatus: PENDING`, and stays
 * unusable until an admin approves it from the Pending Coaches screen.
 */
export type RegisterCoachResponse = {
  email: string;
  status: "PENDING_APPROVAL";
};

export type UserListResponse = {
  users: AuthUser[];
  pagination?: PaginationMeta;
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
  | "BatchStudent"
  | "Puzzle"
  | "PuzzleTopic"
  | "Course"
  | "CourseModule";

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
    yearsOfExperience: z.number().int().min(0).max(80).optional(),
    acquisitionSource: acquisitionSourceSchema.optional(),
    acquisitionDetail: z.string().max(200).optional(),
    utmSource: z.string().max(200).optional(),
    utmMedium: z.string().max(200).optional(),
    utmCampaign: z.string().max(200).optional(),
    utmContent: z.string().max(200).optional(),
    utmTerm: z.string().max(200).optional(),
    landingReferrer: z.string().max(500).optional()
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

//
// LIVE CLASS PRE-CLASS SETTINGS & PRESETS
//

/** Layer 1 system defaults (singleton), admin-managed. */
export type LiveClassPolicyResponse = {
  id: string;
  name: string;
  settings: LiveClassSettings;
  updatedAt: string;
};

export const updateLiveClassPolicyRequestSchema = z.object({
  settings: liveClassSettingsOverrideSchema
});
export type UpdateLiveClassPolicyRequest = z.infer<typeof updateLiveClassPolicyRequestSchema>;

/**
 * Resolved config for one class plus each contributing layer, so the UI can
 * label a field "inherited from batch" vs "custom for this class".
 */
export type LiveClassSettingsForClassResponse = {
  classId: string;
  system: LiveClassSettings;
  batchOverride: LiveClassSettingsOverride | null;
  classOverride: LiveClassSettingsOverride | null;
  resolved: LiveClassSettings;
  /** Frozen effective config if the class has already started, else null (§38). */
  snapshot: LiveClassSettings | null;
  canEdit: boolean;
};

export const updateLiveClassSettingsRequestSchema = z.object({
  liveClassSettings: liveClassSettingsOverrideSchema.nullable(),
  presetId: z.string().optional()
});
export type UpdateLiveClassSettingsRequest = z.infer<typeof updateLiveClassSettingsRequestSchema>;

export type BatchLiveClassSettingsResponse = {
  batchId: string;
  system: LiveClassSettings;
  batchOverride: LiveClassSettingsOverride | null;
  resolved: LiveClassSettings;
  canEdit: boolean;
};

/** One `LIVE_SETTINGS_CHANGE` audit row, admin-facing. */
export type LiveClassSettingsAuditEntry = {
  id: string;
  /** "LiveClassPolicy" | "Batch" | "CoachClass" */
  entity: string;
  entityId: string;
  /** "SYSTEM" | "BATCH" | "CLASS" */
  scope: string;
  /** Human label for the target (batch/class name), or null for the singleton policy. */
  entityName: string | null;
  actorName: string | null;
  createdAt: string;
  /** Override blobs (or full settings for the policy) before/after the change. */
  before: LiveClassSettingsOverride | null;
  after: LiveClassSettingsOverride | null;
};

export type LiveClassSettingsAuditResponse = {
  entries: LiveClassSettingsAuditEntry[];
};

//
// CHESS APPEARANCE (board theme / piece set customization)
//

/** Resolved appearance for the caller, plus which layer produced it. */
export type ChessAppearanceResponse = {
  config: ChessAppearance;
  source: "user" | "admin-default" | "system-default";
  /** True when the admin has locked board settings — see `ResolvedChessAppearance.locked`. */
  locked: boolean;
};

/** Enabled board themes + piece sets + sound themes for picker UIs. */
export type ChessAppearanceCatalogResponse = {
  boardThemes: BoardThemeMeta[];
  pieceSets: PieceSetMeta[];
  soundThemes: SoundThemeMeta[];
};

export const updateChessAppearanceRequestSchema = z.object({
  settings: chessAppearanceOverrideSchema
});
export type UpdateChessAppearanceRequest = z.infer<typeof updateChessAppearanceRequestSchema>;

/** Layer 1 admin global default (singleton), admin-managed. */
export type ChessAppearanceAdminResponse = {
  id: string;
  settings: ChessAppearanceOverride;
  resolved: ChessAppearance;
  disabledBoardThemeIds: string[];
  disabledPieceSetIds: string[];
  disabledSoundThemeIds: string[];
  /** When true, every user resolves straight to this admin default — no personal override applies. */
  locked: boolean;
  updatedAt: string;
};

export const updateChessAppearanceAdminRequestSchema = z.object({
  settings: chessAppearanceOverrideSchema,
  disabledBoardThemeIds: z.array(z.string()).optional(),
  disabledPieceSetIds: z.array(z.string()).optional(),
  disabledSoundThemeIds: z.array(z.string()).optional(),
  locked: z.boolean().optional()
});
export type UpdateChessAppearanceAdminRequest = z.infer<
  typeof updateChessAppearanceAdminRequestSchema
>;

export const updateBatchLiveClassSettingsRequestSchema = z.object({
  liveClassSettings: liveClassSettingsOverrideSchema.nullable()
});
export type UpdateBatchLiveClassSettingsRequest = z.infer<
  typeof updateBatchLiveClassSettingsRequestSchema
>;

export const liveClassPresetScopeSchema = z.enum(["PERSONAL", "ORG"]);
export type LiveClassPresetScope = z.infer<typeof liveClassPresetScopeSchema>;

export type LiveClassPreset = {
  id: string;
  name: string;
  description: string | null;
  scope: LiveClassPresetScope;
  isSystem: boolean;
  isDefault: boolean;
  settings: LiveClassSettingsOverride;
  ownerId: string | null;
  ownerName: string | null;
  /** True when the requesting user may edit/delete this preset. */
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LiveClassPresetsResponse = {
  presets: LiveClassPreset[];
};

export const createLiveClassPresetRequestSchema = z.object({
  name: z.string().min(1, "Name is required.").max(80),
  description: z.string().max(500).optional(),
  scope: liveClassPresetScopeSchema.default("PERSONAL"),
  settings: liveClassSettingsOverrideSchema,
  isDefault: z.boolean().optional()
});
export type CreateLiveClassPresetRequest = z.infer<typeof createLiveClassPresetRequestSchema>;

export const updateLiveClassPresetRequestSchema = createLiveClassPresetRequestSchema.partial();
export type UpdateLiveClassPresetRequest = z.infer<typeof updateLiveClassPresetRequestSchema>;

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
    joinedAt: string | null;
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
  endsAt: z.string(),
  // Pre-class configuration (partial override on top of batch/system defaults).
  // `presetId` is resolved server-side into `liveClassSettings` at create time.
  liveClassSettings: liveClassSettingsOverrideSchema.optional(),
  presetId: z.string().optional()
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
  actualStart: z.string().nullable(),
  actualEnd: z.string().nullable(),
  status: attendanceStatusEnum,
  joinedAt: z.string().nullable(),
  leftAt: z.string().nullable(),
  scheduledDuration: z.number(),
  /** Actual class run length in seconds (falls back to scheduledDuration). */
  classActualDuration: z.number(),
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

// Coach logs carry board events (BOARD_JOIN / BOARD_LEAVE) on top of the student
// event set, so `eventType` stays a free string rather than the student enum.
export const coachAttendanceLogEntrySchema = z.object({
  id: z.string(),
  eventType: z.string(),
  timestamp: z.string(),
  sessionStart: z.string().nullable(),
  sessionEnd: z.string().nullable(),
  sessionDuration: z.number().nullable(),
  reason: z.string().nullable(),
  source: z.string(),
});

export type CoachAttendanceLogEntry = z.infer<typeof coachAttendanceLogEntrySchema>;

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
  reconnectCount: z.number().optional(),
  logs: z.array(coachAttendanceLogEntrySchema).optional(),
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

// Read-time derived presence (RELIABILITY_DESIGN.md §3.2), not a persisted
// column: ONLINE/RECONNECTING/OFFLINE split further what `isOnline` used to
// collapse into a single boolean, using lastHeartbeatAt + AttendancePolicy
// .gracePeriodMinutes. `.optional()` so a response from an API build that
// predates this field (rolling deploy) still parses.
export const participantPresenceSchema = z.enum(["ONLINE", "RECONNECTING", "OFFLINE", "LEFT"]);
export type ParticipantPresence = z.infer<typeof participantPresenceSchema>;

export const liveMonitoringStudentSchema = z.object({
  id: z.string(),
  name: z.string(),
  isOnline: z.boolean(),
  presence: participantPresenceSchema.optional(),
  lastHeartbeatAt: z.string().nullable().optional(),
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

// -- LIVE RELIABILITY (cross-class) TYPES (RELIABILITY_DESIGN.md §4.5) --

export const liveReliabilityParticipantSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["COACH", "STUDENT"]),
  presence: participantPresenceSchema,
  lastHeartbeatAt: z.string().nullable(),
});

export const liveReliabilityClassSchema = z.object({
  classId: z.string(),
  title: z.string(),
  coachName: z.string(),
  batchName: z.string().nullable(),
  startedAt: z.string().nullable(),
  reconnectingCount: z.number(),
  offlineCount: z.number(),
  affectedParticipants: z.array(liveReliabilityParticipantSchema),
});

export const liveReliabilityOverviewSchema = z.object({
  generatedAt: z.string(),
  liveClassCount: z.number(),
  affectedClassCount: z.number(),
  totalReconnecting: z.number(),
  totalOffline: z.number(),
  classes: z.array(liveReliabilityClassSchema),
});

export type LiveReliabilityParticipant = z.infer<typeof liveReliabilityParticipantSchema>;
export type LiveReliabilityClass = z.infer<typeof liveReliabilityClassSchema>;
export type LiveReliabilityOverview = z.infer<typeof liveReliabilityOverviewSchema>;

// Trailing-window webhook-loss / heartbeat-fallback rate (§6 Phase 6).
export const reliabilityMetricsSchema = z.object({
  windowDays: z.number(),
  sampledClasses: z.number(),
  totalParticipantSessions: z.number(),
  webhookLossCount: z.number(),
  webhookLossRate: z.number(),
  heartbeatFallbackCount: z.number(),
  heartbeatFallbackRate: z.number(),
});

export type ReliabilityMetrics = z.infer<typeof reliabilityMetricsSchema>;

export const recordingProgressRequestSchema = z.object({
  watchedSeconds: z.number().int().min(0)
});

export type RecordingProgressRequest = z.infer<typeof recordingProgressRequestSchema>;

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

// -- COMPLETED CLASSES LISTING TYPES --

export const completedClassItemSchema = z.object({
  id: z.string(),
  topic: z.string(),
  batchName: z.string(),
  coachName: z.string(),
  coachId: z.string(),
  date: z.string(),
  scheduledStart: z.string(),
  scheduledEnd: z.string(),
  actualStart: z.string().nullable(),
  actualEnd: z.string().nullable(),
  scheduledDuration: z.number(),
  actualDuration: z.number(),
  status: z.string(),
  totalStudents: z.number(),
  studentsAttended: z.number(),
  coachTeachingDuration: z.number(),
  coachBoardDuration: z.number(),
  attendancePercent: z.number(),
});

export const completedClassesResponseSchema = z.object({
  classes: z.array(completedClassItemSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

export type CompletedClassItem = z.infer<typeof completedClassItemSchema>;
export type CompletedClassesResponse = z.infer<typeof completedClassesResponseSchema>;

// -- ADMIN COACH TEACHING REPORT TYPES --

export const adminCoachTeachingItemSchema = z.object({
  coachId: z.string(),
  coachName: z.string(),
  email: z.string(),
  totalClasses: z.number(),
  completedClasses: z.number(),
  cancelledClasses: z.number(),
  totalScheduledHours: z.number(),
  totalActualHours: z.number(),
  avgDurationMinutes: z.number(),
  completionPercent: z.number(),
});

export const adminCoachTeachingReportSchema = z.object({
  coaches: z.array(adminCoachTeachingItemSchema),
});

export type AdminCoachTeachingItem = z.infer<typeof adminCoachTeachingItemSchema>;
export type AdminCoachTeachingReport = z.infer<typeof adminCoachTeachingReportSchema>;

// -- CLASS DETAIL REPORT TYPES (extended) --

export const classDetailStudentLogSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  status: z.string(),
  joinedAt: z.string().nullable(),
  leftAt: z.string().nullable(),
  duration: z.number(),
  attendancePercent: z.number(),
  reconnectCount: z.number(),
  logCount: z.number(),
  logs: z.array(attendanceLogEntrySchema),
});

export const classDetailCoachAttendanceSchema = z.object({
  coachName: z.string(),
  joinedAt: z.string().nullable(),
  leftAt: z.string().nullable(),
  totalDuration: z.number().nullable(),
  boardDuration: z.number().nullable(),
  reconnectCount: z.number(),
  logs: z.array(coachAttendanceLogEntrySchema),
});

export const classDetailReportSchema = z.object({
  classId: z.string(),
  topic: z.string(),
  batchName: z.string(),
  coachName: z.string(),
  scheduledStart: z.string(),
  scheduledEnd: z.string(),
  actualStart: z.string().nullable(),
  actualEnd: z.string().nullable(),
  scheduledDuration: z.number(),
  actualDuration: z.number(),
  status: z.string(),
  totalStudents: z.number(),
  presentCount: z.number(),
  absentCount: z.number(),
  lateCount: z.number(),
  partialCount: z.number(),
  overallPercent: z.number(),
  coachAttendance: classDetailCoachAttendanceSchema.nullable(),
  students: z.array(classDetailStudentLogSchema),
});

export type ClassDetailStudentLog = z.infer<typeof classDetailStudentLogSchema>;
export type ClassDetailCoachAttendance = z.infer<typeof classDetailCoachAttendanceSchema>;
export type ClassDetailReport = z.infer<typeof classDetailReportSchema>;

// -- POST-CLASS SUMMARY TYPES --

export const classSummaryMyAttendanceSchema = z.object({
  status: attendanceStatusEnum,
  attendancePercent: z.number(),
  totalDuration: z.number(),
  joinedAt: z.string().nullable(),
  leftAt: z.string().nullable(),
  reconnectCount: z.number(),
});

export const classSummaryResponseSchema = z.object({
  classId: z.string(),
  topic: z.string(),
  batchName: z.string(),
  coachName: z.string(),
  scheduledStart: z.string(),
  scheduledEnd: z.string(),
  actualStart: z.string().nullable(),
  actualEnd: z.string().nullable(),
  actualDuration: z.number(),
  status: z.string(),
  finalized: z.boolean(),
  viewerRole: z.enum(["COACH", "ADMIN", "STUDENT"]),
  report: classDetailReportSchema.nullable(),
  myAttendance: classSummaryMyAttendanceSchema.nullable(),
});

export type ClassSummaryMyAttendance = z.infer<typeof classSummaryMyAttendanceSchema>;
export type ClassSummaryResponse = z.infer<typeof classSummaryResponseSchema>;

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

export const demoRegistrationContactMethodSchema = z.enum(["PHONE", "EMAIL"]);
export type DemoRegistrationContactMethod = z.infer<
  typeof demoRegistrationContactMethodSchema
>;

export const guestJoinDemoRequestSchema = z
  .object({
    guestName: z.string().trim().min(1, "Name is required").max(50),
    contactMethod: demoRegistrationContactMethodSchema.default("PHONE"),
    phoneNumber: z.string().trim().max(20).optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter a valid email address")
      .max(200)
      .optional()
  })
  .refine(
    (value) =>
      value.contactMethod === "EMAIL"
        ? !!value.email
        : !!value.phoneNumber && value.phoneNumber.replace(/\D/g, "").length >= 7,
    {
      message: "Enter a valid phone number or email address.",
      path: ["contactMethod"]
    }
  );

export const guestJoinDemoResponseSchema = z.object({
  registered: z.literal(true),
  /** True once a LiveKit token was minted — false means registered but the
   *  class has not gone live yet; the visitor comes back once it has. */
  joined: z.boolean(),
  token: z.string().nullable(),
  roomName: z.string().nullable(),
  topic: z.string(),
  startsAt: z.string().datetime().nullable(),
  message: z.string().nullable()
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
  classes: z.array(demoClassSchema),
  pagination: paginationMetaSchema.optional()
});

export const demoClassRegistrationItemSchema = z.object({
  name: z.string(),
  contactMethod: demoRegistrationContactMethodSchema,
  contact: z.string(),
  registeredAt: z.string().datetime(),
  joined: z.boolean()
});
export type DemoClassRegistrationItem = z.infer<
  typeof demoClassRegistrationItemSchema
>;

export const demoClassDetailsSchema = demoClassSchema.extend({
  actualStartsAt: z.string().datetime().nullable(),
  actualEndsAt: z.string().datetime().nullable(),
  registrations: z.array(demoClassRegistrationItemSchema)
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
    joinedAt: string | null;
  }[];
};

export type ListAdminBatchClassesResponse = {
  classes: AdminBatchClass[];
  pagination?: PaginationMeta;
};

export type AdminBatchClassDetailsResponse = {
  class: AdminBatchClassDetails;
};

//
// ASSIGNMENTS
//
// An assignment is a reusable PGN item in a library. Admins author shared items
// (visible to every coach); coaches author private items (visible only to the
// author). A coach then deploys an item to one or more of their batches with a
// due date, which fans out one per-student completion row per batch member.

/** 512KB of PGN text — mirrors MAX_PGN_LENGTH in the API upload controller. */
export const MAX_ASSIGNMENT_PGN_LENGTH = 512 * 1024;

export const assignmentDifficultySchema = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
export const assignmentStatusSchema = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]);

export type AssignmentDifficulty = z.infer<typeof assignmentDifficultySchema>;
export type AssignmentStatus = z.infer<typeof assignmentStatusSchema>;

// The interactive activity an assignment asks the student to perform. Rows that
// predate this field behave as REPLAY (the legacy PGN-replay viewer).
export const assignmentActivityTypeSchema = z.enum([
  "REPLAY",
  "SOLVE_LINE",
  "PLAY_VS_ENGINE",
  "FREE_ANALYSIS"
]);
export type AssignmentActivityType = z.infer<typeof assignmentActivityTypeSchema>;

export const assignmentAttemptStatusSchema = z.enum([
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "ABANDONED"
]);
export type AssignmentAttemptStatus = z.infer<typeof assignmentAttemptStatusSchema>;

export const chessColorSchema = z.enum(["white", "black"]);
export type ChessColor = z.infer<typeof chessColorSchema>;

const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/;

/** One move of a stored solution line. `uci` is the source of truth for scoring. */
export const solutionMoveSchema = z.object({
  uci: z.string().regex(UCI_RE, "Invalid UCI move."),
  san: z.string().min(1).max(12)
});
export type SolutionMove = z.infer<typeof solutionMoveSchema>;

export const attemptMoveClassificationSchema = z.enum([
  "CORRECT",
  "INCORRECT",
  "NEUTRAL",
  "BOOK",
  "GOOD",
  "INACCURACY",
  "MISTAKE",
  "BLUNDER"
]);

/** One move a student played during an attempt. Sent by the client on save. */
export const attemptMoveSchema = z.object({
  ply: z.number().int().min(1).max(400),
  uci: z.string().regex(UCI_RE, "Invalid UCI move."),
  san: z.string().min(1).max(12),
  fenAfter: z.string().min(1).max(120),
  elapsedMs: z.number().int().min(0).max(86_400_000).optional()
});
export type AttemptMove = z.infer<typeof attemptMoveSchema> & {
  correct?: boolean;
  classification?: z.infer<typeof attemptMoveClassificationSchema>;
  evalCp?: number | null;
};

/**
 * Create a library assignment. `batchIds` + `dueDate` are optional — when a coach
 * supplies them the item is created and immediately deployed to those batches in
 * one step. Admins omit them (library-only).
 */
/**
 * Fields that configure an interactive activity. All optional so existing
 * REPLAY callers are unaffected; validated per `activityType` in a superRefine.
 */
const assignmentActivityConfigShape = {
  activityType: assignmentActivityTypeSchema.optional(),
  startFen: z.string().trim().max(120).optional(),
  solutionMoves: z.array(solutionMoveSchema).max(80).optional(),
  orientation: chessColorSchema.optional(),
  studentColor: chessColorSchema.optional(),
  engineLevel: z.number().int().min(0).max(20).optional(),
  passThresholdPercent: z.number().int().min(1).max(100).optional(),
  maxAttempts: z.number().int().min(1).max(50).nullable().optional(),
  allowHints: z.boolean().optional(),
  allowRetry: z.boolean().optional(),
  requiredCompletionPercent: z.number().int().min(1).max(100).optional()
};

type ActivityConfigInput = {
  activityType?: AssignmentActivityType;
  pgn?: string;
  startFen?: string;
  solutionMoves?: SolutionMove[];
};

function refineActivityConfig(
  v: ActivityConfigInput,
  ctx: z.RefinementCtx,
  { requirePgn }: { requirePgn: boolean }
) {
  const type = v.activityType ?? (requirePgn ? "REPLAY" : undefined);
  if (type === undefined) return;

  if (type === "REPLAY") {
    if (requirePgn && !v.pgn?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pgn"], message: "PGN is required." });
    }
    return;
  }

  if (!v.startFen?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["startFen"],
      message: "A starting position is required for this activity."
    });
  }

  if (type === "SOLVE_LINE" && (!v.solutionMoves || v.solutionMoves.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["solutionMoves"],
      message: "Record at least one solution move."
    });
  }
}

export const createAssignmentRequestSchema = z
  .object({
    title: z.string().min(1, "Title is required.").max(200),
    description: z.string().max(2000).optional(),
    pgn: z.string().max(MAX_ASSIGNMENT_PGN_LENGTH, "PGN is too large.").optional(),
    difficulty: assignmentDifficultySchema.optional().default("BEGINNER"),
    timeLimitMinutes: z.number().int().min(1).optional(),
    batchIds: z.array(z.string().min(1)).optional(),
    dueDate: z.string().datetime({ message: "A valid due date is required." }).optional(),
    ...assignmentActivityConfigShape
  })
  .superRefine((v, ctx) => {
    if (v.batchIds && v.batchIds.length > 0 && !v.dueDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueDate"],
        message: "A due date is required when assigning to batches."
      });
    }
    refineActivityConfig(v, ctx, { requirePgn: true });
  });

export const updateAssignmentRequestSchema = z
  .object({
    title: z.string().min(1, "Title is required.").max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    pgn: z.string().max(MAX_ASSIGNMENT_PGN_LENGTH, "PGN is too large.").optional(),
    difficulty: assignmentDifficultySchema.optional(),
    timeLimitMinutes: z.number().int().min(1).optional(),
    ...assignmentActivityConfigShape
  })
  .superRefine((v, ctx) => refineActivityConfig(v, ctx, { requirePgn: false }));

export const deployAssignmentRequestSchema = z.object({
  assignmentId: z.string().min(1, "Assignment is required."),
  batchIds: z.array(z.string().min(1)).min(1, "Select at least one batch."),
  dueDate: z.string().datetime({ message: "A valid due date is required." })
});

export const updateAssignmentStatusRequestSchema = z.object({
  status: z.enum(["IN_PROGRESS", "COMPLETED"]),
  note: z.string().max(1000).optional(),
  timeSpentSeconds: z.number().int().min(0).optional()
});

// ── Attempt lifecycle (evaluated activities) ──

export const saveAttemptProgressRequestSchema = z.object({
  moves: z.array(attemptMoveSchema).max(400),
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
  hintsUsed: z.number().int().min(0).max(200).optional()
});

export const submitAttemptRequestSchema = saveAttemptProgressRequestSchema.extend({
  /** explicit end for PLAY_VS_ENGINE (resign) / FREE_ANALYSIS (submit). */
  resign: z.boolean().optional()
});

export const requestEngineMoveRequestSchema = z.object({
  fen: z.string().min(1).max(120)
});

export const solveLineHintRequestSchema = z.object({
  moves: z.array(attemptMoveSchema).max(400),
  /** 1 = which piece, 2 = from-square, 3 = the full move. */
  level: z.number().int().min(1).max(3)
});

export type CreateAssignmentRequest = z.infer<typeof createAssignmentRequestSchema>;
export type UpdateAssignmentRequest = z.infer<typeof updateAssignmentRequestSchema>;
export type DeployAssignmentRequest = z.infer<typeof deployAssignmentRequestSchema>;
export type UpdateAssignmentStatusRequest = z.infer<typeof updateAssignmentStatusRequestSchema>;
export type SaveAttemptProgressRequest = z.infer<typeof saveAttemptProgressRequestSchema>;
export type SubmitAttemptRequest = z.infer<typeof submitAttemptRequestSchema>;
export type RequestEngineMoveRequest = z.infer<typeof requestEngineMoveRequestSchema>;
export type SolveLineHintRequest = z.infer<typeof solveLineHintRequestSchema>;

/** Configuration a client needs to render an interactive activity. */
export type AssignmentActivityConfig = {
  activityType: AssignmentActivityType;
  startFen: string | null;
  orientation: ChessColor | null;
  studentColor: ChessColor | null;
  engineLevel: number | null;
  passThresholdPercent: number;
  maxAttempts: number | null;
  allowHints: boolean;
  allowRetry: boolean;
  requiredCompletionPercent: number;
};

export type AssignmentLibraryItem = AssignmentActivityConfig & {
  id: string;
  title: string;
  description: string | null;
  pgn: string;
  pgnUrl: string | null;
  difficulty: AssignmentDifficulty;
  timeLimitMinutes: number | null;
  /** true = shared library item (admin), false = author-private (coach). */
  isLibrary: boolean;
  createdById: string | null;
  createdByName: string | null;
  /** the caller may edit/delete this item. */
  canManage: boolean;
  deploymentCount: number;
  /** the expected line — staff-only, always present for SOLVE_LINE. */
  solutionMoves: SolutionMove[] | null;
  /** aggregate performance across every deployment (staff view). */
  performance: AssignmentPerformanceSummary | null;
  createdAt: string;
};

export type AssignmentPerformanceSummary = {
  assigned: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  failed: number;
  averageScorePercent: number | null;
  averageAccuracyPercent: number | null;
  averageAttempts: number | null;
};

export type AssignmentLibraryResponse = {
  assignments: AssignmentLibraryItem[];
};

export type AssignmentResponse = {
  assignment: AssignmentLibraryItem;
};

export type AssignmentDeploymentStats = {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
};

export type AssignmentDeployment = {
  id: string;
  assignmentId: string;
  title: string;
  difficulty: AssignmentDifficulty;
  timeLimitMinutes: number | null;
  batchId: string;
  batchName: string;
  dueDate: string;
  createdAt: string;
  stats: AssignmentDeploymentStats;
};

export type AssignmentDeploymentListResponse = {
  deployments: AssignmentDeployment[];
};

export type AssignmentSubmission = {
  studentId: string;
  studentName: string;
  status: AssignmentStatus;
  completedAt: string | null;
  note: string | null;
  timeSpentSeconds: number | null;
  bestScorePercent: number | null;
  bestAccuracyPercent: number | null;
  attemptCount: number;
  lastAttemptAt: string | null;
};

export type AssignmentDeploymentDetail = AssignmentDeployment & {
  description: string | null;
  pgn: string;
  pgnUrl: string | null;
  activityType: AssignmentActivityType;
  submissions: AssignmentSubmission[];
};

export type AssignmentDeploymentDetailResponse = {
  deployment: AssignmentDeploymentDetail;
};

export type StudentAssignmentItem = AssignmentActivityConfig & {
  /** the StudentAssignment row id — used for the detail route + status updates. */
  id: string;
  assignmentId: string;
  title: string;
  description: string | null;
  pgn: string;
  pgnUrl: string | null;
  difficulty: AssignmentDifficulty;
  timeLimitMinutes: number | null;
  dueDate: string;
  coachName: string | null;
  batchName: string;
  status: AssignmentStatus;
  completedAt: string | null;
  note: string | null;
  timeSpentSeconds: number | null;
  bestScorePercent: number | null;
  bestAccuracyPercent: number | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  /** number of moves in the expected line — count only, never the moves. */
  solutionLength: number | null;
  /** the expected line — ONLY populated once the student has completed it. */
  solutionMoves: SolutionMove[] | null;
};

export type StudentAssignmentListResponse = {
  assignments: StudentAssignmentItem[];
};

export type StudentAssignmentDetailResponse = {
  assignment: StudentAssignmentItem;
};

// ── Attempts ──

export type AssignmentAttempt = {
  id: string;
  attemptNumber: number;
  status: AssignmentAttemptStatus;
  moves: AttemptMove[];
  scorePercent: number | null;
  accuracyPercent: number | null;
  hintsUsed: number;
  durationSeconds: number;
  result: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type StartAttemptResponse = {
  attempt: AssignmentAttempt;
  config: AssignmentActivityConfig;
  /** resolved starting FEN (falls back to the standard position). */
  startFen: string;
  /** count of expected solution moves — never the moves themselves. */
  solutionLength: number | null;
  attemptCount: number;
  attemptsRemaining: number | null;
};

export type AttemptReviewMove = {
  ply: number;
  fenBefore: string;
  yourMove: string | null;
  expectedMove: string | null;
  correct: boolean | null;
};

export type AssignmentEvaluationResult = {
  attempt: AssignmentAttempt;
  scorePercent: number;
  accuracyPercent: number | null;
  passed: boolean;
  status: AssignmentAttemptStatus;
  result: string;
  /** move-by-move comparison — safe to show once returned (attempt is over). */
  review: AttemptReviewMove[];
  /** the expected line — returned only when the assignment allows review. */
  solutionMoves: SolutionMove[] | null;
  assignmentStatus: AssignmentStatus;
  bestScorePercent: number | null;
  bestAccuracyPercent: number | null;
  attemptCount: number;
  attemptsRemaining: number | null;
  /** true when engine scoring could not run (PLAY_VS_ENGINE, engine offline). */
  engineUnavailable: boolean;
};

export type AssignmentAttemptHistoryResponse = {
  attempts: AssignmentAttempt[];
  bestScorePercent: number | null;
  bestAccuracyPercent: number | null;
};

/** Immediate per-move feedback returned while saving SOLVE_LINE progress. */
export type SolveLineMoveFeedback = {
  ply: number;
  correct: boolean;
  /** the forced opponent reply to play now (only this move is revealed). */
  opponentReply: { uci: string; san: string; fenAfter: string } | null;
  lineComplete: boolean;
};

export type AttemptProgressResponse = {
  attempt: AssignmentAttempt;
  moveFeedback: SolveLineMoveFeedback | null;
};

/** Progressive hint for the next student move of a SOLVE_LINE attempt. */
export type SolveLineHint = {
  /** the level actually served (never exceeds what was requested). */
  level: 1 | 2 | 3;
  /** false when the moves played so far already diverge from the line. */
  onTrack: boolean;
  /** true when there is no further student move to hint. */
  lineComplete: boolean;
  /** chess.js piece letter of the piece to move. */
  pieceType: "p" | "n" | "b" | "r" | "q" | "k" | null;
  /** the origin square — populated at level >= 2. */
  fromSquare: string | null;
  /** the destination square — populated at level 3. */
  toSquare: string | null;
  /** the move in SAN / UCI — populated at level 3. */
  san: string | null;
  uci: string | null;
  /** running hint count persisted on the attempt. */
  hintsUsed: number;
};

export type RequestEngineMoveResponse = {
  available: boolean;
  gameOver: boolean;
  uci: string | null;
  san: string | null;
  fenAfter: string | null;
};

//
// STOCKFISH ENGINE ANALYSIS
//
// `POST /stockfish/analyze` — coach/admin only. The client sends the current
// position as a FEN; the API returns the pooled engine's evaluation of it.

export const stockfishAnalyzeRequestSchema = z.object({
  fen: z.string().trim().min(1, "FEN is required.").max(120, "FEN is malformed.")
});

export type StockfishAnalyzeRequest = z.infer<typeof stockfishAnalyzeRequestSchema>;

export interface StockfishAnalysisResult {
  /** Centipawn evaluation in pawns (white-positive). `null` when a mate is seen. */
  evaluation: number | null;
  /** Moves-to-mate (sign = side to deliver it). `null` when it is a cp score. */
  mate: number | null;
  /** Best move in SAN (falls back to UCI if the line can't be replayed). */
  bestMove: string;
  /** Best move in raw UCI (`e2e4`), for drawing an arrow on the board. */
  bestMoveUci: string;
  depth: number;
  /** Principal variation in SAN. */
  pv: string[];
  /** Principal variation in raw UCI. */
  pvUci: string[];
}

//
// NOTIFICATIONS
//
// In-app notifications. `GET /notifications` returns the latest items + an
// unread count; `POST /notifications/read` marks some (or all) read.

// The in-app bell is one channel of the admin-configured messaging rules, so
// its type catalogue IS the event catalogue — see ./messaging.
export const notificationTypeSchema = messagingEventSchema;
export type NotificationType = MessagingEvent;

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** in-app deep link, e.g. `/student/assignments/<id>`. */
  linkPath: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationListResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
};

export const markNotificationsReadRequestSchema = z.object({
  /** specific ids to mark read; omit to mark every unread notification read. */
  ids: z.array(z.string().min(1)).max(500).optional()
});
export type MarkNotificationsReadRequest = z.infer<
  typeof markNotificationsReadRequestSchema
>;

export type MarkNotificationsReadResponse = {
  unreadCount: number;
};

//
// BATCH RECURRING CLASS SCHEDULES
//
// A recurring weekly schedule for a batch. Generating it materialises real
// `CoachClass` rows (one per occurrence) that behave exactly like manually
// created classes for live-class, attendance and assignments.

export type BatchScheduleStatus = "ACTIVE" | "PAUSED" | "ENDED";

/** 0 = Sunday … 6 = Saturday. */
export const scheduleRuleInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Expected HH:MM (24h)"),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Expected HH:MM (24h)"),
  coachId: z.string().min(1, "Coach is required"),
  isEnabled: z.boolean().optional()
});
export type ScheduleRuleInput = z.infer<typeof scheduleRuleInputSchema>;

const isoDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const previewBatchScheduleRequestSchema = z.object({
  batchId: z.string().min(1),
  courseId: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(160).optional(),
  timezone: z.string().min(1),
  startDate: isoDateOnly,
  endDate: isoDateOnly,
  rules: z.array(scheduleRuleInputSchema).min(1, "Add at least one weekly class"),
  exceptions: z.array(isoDateOnly).optional()
});
export type PreviewBatchScheduleRequest = z.infer<
  typeof previewBatchScheduleRequestSchema
>;

export const createBatchScheduleRequestSchema =
  previewBatchScheduleRequestSchema.extend({
    /** Proceed even though the preview reported coach/batch conflicts. */
    force: z.boolean().optional()
  });
export type CreateBatchScheduleRequest = z.infer<
  typeof createBatchScheduleRequestSchema
>;

export const updateBatchScheduleRequestSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  courseId: z.string().min(1).nullable().optional(),
  endDate: isoDateOnly.optional(),
  status: z.enum(["ACTIVE", "PAUSED", "ENDED"]).optional(),
  rules: z.array(scheduleRuleInputSchema).min(1).optional(),
  exceptions: z.array(isoDateOnly).optional(),
  /** Regenerate future (not-yet-started) sessions from the new rules. */
  regenerate: z.boolean().optional(),
  force: z.boolean().optional()
});
export type UpdateBatchScheduleRequest = z.infer<
  typeof updateBatchScheduleRequestSchema
>;

export const scheduleOccurrenceActionRequestSchema = z
  .object({
    action: z.enum(["CANCEL", "RESCHEDULE", "RESTORE"]),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    coachId: z.string().min(1).optional()
  })
  .refine(
    (v) =>
      v.action !== "RESCHEDULE" ||
      (Boolean(v.startsAt) && Boolean(v.endsAt)),
    { message: "Reschedule requires startsAt and endsAt", path: ["startsAt"] }
  );
export type ScheduleOccurrenceActionRequest = z.infer<
  typeof scheduleOccurrenceActionRequestSchema
>;

export type BatchScheduleRule = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  coachId: string;
  coachName: string;
  isEnabled: boolean;
};

export type BatchScheduleException = {
  id: string;
  date: string;
  reason: string | null;
};

export type ScheduleWeeklySlot = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  coachId: string;
  coachName: string;
};

export type ScheduleConflict = {
  type: "COACH" | "BATCH";
  date: string;
  startsAt: string;
  endsAt: string;
  coachId: string;
  coachName: string;
  conflictingClassId: string;
  conflictingClassTitle: string;
};

export type ScheduleOccurrencePreview = {
  ruleId: string;
  date: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  coachId: string;
  coachName: string;
  isPast: boolean;
  hasConflict: boolean;
};

export type PreviewBatchScheduleResponse = {
  timezone: string;
  totalCount: number;
  futureCount: number;
  pastCount: number;
  firstClassAt: string | null;
  lastClassAt: string | null;
  weeklySummary: ScheduleWeeklySlot[];
  occurrences: ScheduleOccurrencePreview[];
  conflicts: ScheduleConflict[];
};

export type BatchScheduleSummary = {
  id: string;
  batchId: string;
  batchName: string;
  courseId: string | null;
  courseTitle: string | null;
  title: string;
  timezone: string;
  startDate: string;
  endDate: string;
  status: BatchScheduleStatus;
  ruleCount: number;
  totalClasses: number;
  upcomingClasses: number;
  completedClasses: number;
  cancelledClasses: number;
  createdAt: string;
};

export type BatchScheduleDetail = BatchScheduleSummary & {
  rules: BatchScheduleRule[];
  exceptions: BatchScheduleException[];
};

export type BatchScheduleListResponse = {
  schedules: BatchScheduleSummary[];
};

export type BatchScheduleResponse = {
  schedule: BatchScheduleDetail;
  generatedCount?: number;
  cancelledCount?: number;
};

export type ScheduleCalendarClass = {
  id: string;
  batchId: string;
  batchName: string;
  title: string;
  coachId: string;
  coachName: string;
  startsAt: string;
  endsAt: string;
  status: ClassStatus;
  scheduleId: string | null;
  sessionNumber: number | null;
  hasRecording: boolean;
};

export type ScheduleCalendarResponse = {
  classes: ScheduleCalendarClass[];
};

// ──────────────────────────────────────────────
// Admin Analytics contract (large — kept in its own module)
// ──────────────────────────────────────────────
export * from "./analytics";

// ──────────────────────────────────────────────
// Puzzle library contract (kept in its own module)
// ──────────────────────────────────────────────
export * from "./puzzle";

// ──────────────────────────────────────────────
// Live-class puzzle assignment (depends on ./puzzle)
// ──────────────────────────────────────────────
export * from "./puzzle-scoring";
export * from "./live-class-puzzle";

// ──────────────────────────────────────────────
// Course library (depends on ./puzzle + Assignment types above)
// ──────────────────────────────────────────────
export * from "./course";

// ──────────────────────────────────────────────
// Admin messaging rules + announcements (kept in its own module)
// ──────────────────────────────────────────────
export * from "./messaging";

// ──────────────────────────────────────────────
// Payments: provider-agnostic checkout, refunds, subscriptions, invoices
// ──────────────────────────────────────────────
export * from "./payments";

// Invoicing: tax engine, invoice + credit-note documents, billing settings
export * from "./invoices";

// ──────────────────────────────────────────────
// Coach payroll & payslips: what the academy owes a coach, computed from
// teaching activity — separate from ./payments + ./invoices (customer
// billing). Kept in its own module (depends on nothing above).
// ──────────────────────────────────────────────
export * from "./payroll";

// ──────────────────────────────────────────────
// Academy leads CRM: "book a demo" inquiries from the public marketing site,
// plus the visitor-session attribution they're traced back to.
// ──────────────────────────────────────────────
export * from "./leads";

// ──────────────────────────────────────────────
// Coach feedback & ratings: admin-authored forms, where/when students see
// them, and the per-coach rating roll-up.
// ──────────────────────────────────────────────
export * from "./feedback";
