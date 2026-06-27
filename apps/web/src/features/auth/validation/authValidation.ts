import { getEmailError, getFieldError } from "../../../lib/forms";
import type { LoginFormValues, RegisterFormValues } from "../types/auth";

export type TouchedFields<TValues> = Partial<Record<keyof TValues, boolean>>;
export type FormErrors<TValues> = Partial<Record<keyof TValues, string>>;

export function validateLoginForm(
  values: LoginFormValues,
  touched: TouchedFields<LoginFormValues>
) {
  return {
    email: getEmailError(Boolean(touched.email), values.email),
    password: getFieldError(
      Boolean(touched.password),
      values.password,
      "Password is required."
    )
  } satisfies FormErrors<LoginFormValues>;
}

export function validateRegisterForm(
  values: RegisterFormValues,
  touched: TouchedFields<RegisterFormValues>
) {
  return {
    studentName: getFieldError(
      Boolean(touched.studentName),
      values.studentName,
      "Student name is required."
    ),
    parentName: getFieldError(
      Boolean(touched.parentName),
      values.parentName,
      "Parent name is required."
    ),
    studentAge: getFieldError(
      Boolean(touched.studentAge),
      values.studentAge,
      "Student age is required."
    ),
    experienceLevel: getFieldError(
      Boolean(touched.experienceLevel),
      values.experienceLevel,
      "Choose an experience level."
    ),
    contactNumber: getFieldError(
      Boolean(touched.contactNumber),
      values.contactNumber,
      "Contact number is required."
    ),
    email: getEmailError(Boolean(touched.email), values.email),
    password: getFieldError(
      Boolean(touched.password),
      values.password,
      "Password is required."
    ),
    confirmPassword:
      touched.confirmPassword && values.confirmPassword !== values.password
        ? "Passwords must match."
        : getFieldError(
            Boolean(touched.confirmPassword),
            values.confirmPassword,
            "Confirm your password."
          )
  } satisfies FormErrors<RegisterFormValues>;
}
