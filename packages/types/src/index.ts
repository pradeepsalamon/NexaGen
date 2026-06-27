export type UserRole = "SUPER_ADMIN" | "ADMIN" | "COACH" | "STUDENT";

export type UserStatus = "ACTIVE" | "PENDING" | "SUSPENDED" | "DELETED";

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type AuthUser = {
  email: string;
  firstName: string;
  id: string;
  isEmailVerified: boolean;
  lastName?: string | null;
  role: UserRole;
  status: UserStatus;
};

export type RegisterRequest = {
  confirmPassword: string;
  contactNumber: string;
  email: string;
  experienceLevel: ExperienceLevel;
  parentName: string;
  password: string;
  studentAge: string;
  studentName: string;
};

export type LoginRequest = {
  email: string;
  password: string;
  rememberMe?: boolean;
};

export type ForgotPasswordRequest = {
  email: string;
};

export type ResetPasswordRequest = {
  confirmPassword: string;
  password: string;
  token: string;
};

export type AuthResponse = {
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
