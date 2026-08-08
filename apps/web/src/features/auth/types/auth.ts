import type { ExperienceLevel } from "@nexa-chess/types";

export type { ExperienceLevel };

export type LoginFormValues = {
  email: string;
  password: string;
  rememberMe: boolean;
};

export type RegisterFormValues = {
  confirmPassword: string;
  contactNumber: string;
  email: string;
  experienceLevel: ExperienceLevel | "";
  parentName: string;
  password: string;
  studentAge: string;
  studentName: string;
};
