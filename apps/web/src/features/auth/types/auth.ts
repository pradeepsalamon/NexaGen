import type { AcquisitionSourceValue, ReferralSource } from "@nexa-chess/types";

export type { AcquisitionSourceValue, ReferralSource };

export type LoginFormValues = {
  email: string;
  password: string;
  rememberMe: boolean;
};

export type RegisterFormValues = {
  confirmPassword: string;
  contactNumber: string;
  email: string;
  acquisitionSource: AcquisitionSourceValue | "";
  acquisitionDetail: string;
  parentName: string;
  password: string;
  studentAge: string;
  studentName: string;
};
