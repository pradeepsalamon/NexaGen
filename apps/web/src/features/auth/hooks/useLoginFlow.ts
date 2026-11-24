"use client";

import { useMutation } from "@tanstack/react-query";
import { type AuthUser, isMfaChallenge, type MfaChallengeResponse } from "@nexa-chess/types";
import { type FormEvent, useMemo, useState } from "react";
import { useBrandName } from "@/features/branding/context/TenantBrandProvider";
import { useTouchedFields } from "@/hooks/useTouchedFields";
import { ApiError } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { focusFirstInvalid } from "@/lib/forms";
import { useRouter } from "@/lib/navigation";
import { safeNextPath } from "@/lib/routeAccess";
import { useToast } from "@/providers/ToastProvider";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";
import { login } from "../api/authApi";
import type { LoginFormValues } from "../types/auth";
import { validateLoginForm } from "../validation/authValidation";

const initialValues: LoginFormValues = {
  email: "",
  password: "",
  rememberMe: false
};

/**
 * The sign-in flow behind the login page (`features/auth/frame`): field state and
 * validation, the login call, the lockout message, the MFA challenge and the redirect
 * to the role's dashboard. Pages only lay it out.
 */
export function useLoginFlow() {
  const brandName = useBrandName();
  const router = useRouter();
  const toast = useToast();
  const setUser = useAuthStore((state) => state.setUser);
  const [values, setValues] = useState<LoginFormValues>(initialValues);
  const [challenge, setChallenge] = useState<MfaChallengeResponse | null>(null);
  const { touched, touchAll, touchField } = useTouchedFields<LoginFormValues>();
  const errors = useMemo(() => validateLoginForm(values, touched), [touched, values]);

  const [lockout, setLockout] = useState<string | null>(null);
  const loginMutation = useMutation({
    mutationFn: login,
    onError: (error) => {
      // Too many attempts: the wait time has to stay on screen while they wait, so it sits
      // under the password field instead of in a toast that fades.
      if (error instanceof ApiError && error.status === 429) {
        setLockout(getErrorMessage(error));
        return;
      }
      toast.error({
        message: getErrorMessage(error),
        title: "Login failed"
      });
    },
    onSuccess: (response) => {
      if (isMfaChallenge(response)) {
        setChallenge(response);
        return;
      }
      finishLogin(response.user);
    }
  });

  function finishLogin(user: AuthUser) {
    setUser(user);
    toast.success({
      message: `Welcome back to ${brandName}.`,
      title: "Login successful"
    });
    // A link opened while signed out (a class or checkout from WhatsApp)
    // comes back here: `?next=`, if it is a safe path for this role.
    const next =
      typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next");
    router.push(safeNextPath(next, user.role) ?? getRoleDashboardHref(user.role));
  }

  function resetChallenge() {
    setChallenge(null);
    setValues((currentValues) => ({ ...currentValues, password: "" }));
  }

  function updateField<TField extends keyof LoginFormValues>(
    field: TField,
    value: LoginFormValues[TField]
  ) {
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    touchAll(values);
    setLockout(null);

    if (validateLoginForm(values, { email: true, password: true }).email || !values.password.trim()) {
      focusFirstInvalid(event.currentTarget);
      return;
    }

    loginMutation.mutate(values);
  }

  return {
    challenge,
    errors,
    finishLogin,
    handleSubmit,
    isPending: loginMutation.isPending,
    lockout,
    resetChallenge,
    touchField,
    updateField,
    values
  };
}
