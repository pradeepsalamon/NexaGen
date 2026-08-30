import type { ReferralSource } from "@nexa-chess/types";

export type { ReferralSource };

export type LoginFormValues = {
  email: string;
  password: string;
  rememberMe: boolean;
};

export type RegisterFormValues = {
  confirmPassword: string;
  contactNumber: string;
  email: string;
  referralSource: ReferralSource | "";
  parentName: string;
  password: string;
  studentAge: string;
  studentName: string;
};
