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
