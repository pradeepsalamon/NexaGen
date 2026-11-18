import { getConfirmPasswordError, getEmailError, getFieldError, getNewPasswordError } from "../../../lib/forms";
import type { LoginFormValues, RegisterFormValues } from "../types/auth";

export type TouchedFields<TValues> = Partial<Record<keyof TValues, boolean>>;
export type FormErrors<TValues> = Partial<Record<keyof TValues, string>>;

/** 3–99 written as plain digits with no leading zero (no regex: Semgrep's regex-DoS rule). */
function isStudentAge(value: string): boolean {
  if (value.length < 1 || value.length > 2 || value.startsWith("0")) return false;
  for (const char of value) {
    if (char < "0" || char > "9") return false;
  }
  return Number(value) >= 3;
}

export function validateLoginForm(
  values: LoginFormValues,
  touched: TouchedFields<LoginFormValues>
) {
  return {
    email: getEmailError(Boolean(touched.email), values.email),
    password: getFieldError(
      Boolean(touched.password),
      values.password,
      "Enter your password"
    )
  } satisfies FormErrors<LoginFormValues>;
}

export function validateRegisterForm(
  values: RegisterFormValues,
  touched: TouchedFields<RegisterFormValues>
) {
  return {
    studentName: getFieldError(Boolean(touched.studentName), values.studentName, "Enter the student's name"),
    parentName: getFieldError(Boolean(touched.parentName), values.parentName, "Enter a parent or guardian name"),
    // 3–99 with no leading zero: the demo form's rule (the API only asks for digits).
    studentAge: !touched.studentAge
      ? undefined
      : values.studentAge.trim().length === 0
        ? "Enter the student's age"
        : isStudentAge(values.studentAge)
          ? undefined
          : "Enter an age from 3 to 99",
    acquisitionSource: getFieldError(Boolean(touched.acquisitionSource), values.acquisitionSource, "Choose an option"),
    contactNumber: getFieldError(Boolean(touched.contactNumber), values.contactNumber, "Enter a phone number"),
    email: getEmailError(Boolean(touched.email), values.email),
    password: getNewPasswordError(Boolean(touched.password), values.password),
    confirmPassword: getConfirmPasswordError(Boolean(touched.confirmPassword), values.confirmPassword, values.password)
  } satisfies FormErrors<RegisterFormValues>;
}

/** Every field of a register form marked touched, for the submit check. */
export const ALL_REGISTER_FIELDS_TOUCHED: TouchedFields<RegisterFormValues> = {
  acquisitionSource: true,
  confirmPassword: true,
  contactNumber: true,
  email: true,
  parentName: true,
  password: true,
  studentAge: true,
  studentName: true
};
