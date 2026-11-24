"use client";

import { Lock, Mail } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { AuthHeader } from "../components/AuthHeader";
import { useLoginFlow } from "../hooks/useLoginFlow";
import { MfaCodeStep } from "../components/mfa/MfaCodeStep";
import { MfaEnrollment } from "../components/mfa/MfaEnrollment";

function LoginFields({ flow }: { flow: ReturnType<typeof useLoginFlow> }) {
  const { errors, handleSubmit, isPending, lockout, updateField, values } = flow;

  return (
    <>
      <AuthHeader
        description="Continue your chess journey with expert coaching and a global community."
        title="Welcome back"
      />

      <form className="grid gap-5" noValidate onSubmit={handleSubmit}>
        <FormField error={errors.email} id="email" label="Email address">
          <Input
            autoComplete="email"
            hasError={Boolean(errors.email)}
            id="email"
            inputMode="email"
            leadingIcon={<Mail strokeWidth={2.25} />}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="name@example.com"
            required
            type="email"
            value={values.email}
          />
        </FormField>

        {/* A lockout's wait time stays on screen (UI_RULES § "Form errors"); field problems are a toast. */}
        <FormField
          error={errors.password ?? lockout ?? undefined}
          errorVisible={!errors.password && Boolean(lockout)}
          id="password"
          label="Password"
        >
          <PasswordInput
            autoComplete="current-password"
            hasError={Boolean(errors.password ?? lockout)}
            id="password"
            leadingIcon={<Lock strokeWidth={2.25} />}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder="Enter your password"
            required
            value={values.password}
          />
        </FormField>

        {/* Pulled in: the label's tap height (--control-h-sm) would otherwise add to the
            form's gap above and below this short row. */}
        <div className="-my-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <label
            className="inline-flex min-h-[var(--control-h-sm)] cursor-pointer items-center gap-2 text-sm text-app-text"
            htmlFor="remember-me"
          >
            <Checkbox
              checked={values.rememberMe}
              id="remember-me"
              onCheckedChange={(checked) => updateField("rememberMe", checked === true)}
            />
            Remember me
          </label>
          <Link className="text-sm font-medium text-primary-ink hover:underline" href="/forgot-password">
            Forgot password?
          </Link>
        </div>

        <Button
          fullWidth
          isLoading={isPending}
          size="lg"
          type="submit"
        >
          {isPending ? "Logging in…" : "Log in"}
        </Button>

        <p className="text-center text-sm text-app-muted">
          Don&apos;t have an account?{" "}
          <Link className="font-medium text-primary-ink hover:underline" href="/register">
            Create account
          </Link>
        </p>
      </form>
    </>
  );
}

/** The login card: the sign-in form, swapped for the MFA step when the account needs one. */
export function LoginCard() {
  const flow = useLoginFlow();
  const { challenge, finishLogin, resetChallenge } = flow;
  const enrolling = challenge?.mfaRequired === "SETUP";

  return challenge ? (
            <>
              <AuthHeader
                description={
                  enrolling
                    ? "Your account needs a second step at sign-in. This takes a minute."
                    : "One more step to confirm it's you."
                }
                title={enrolling ? "Set up two-factor sign-in" : "Two-factor sign-in"}
              />
              {enrolling ? (
                <MfaEnrollment
                  challengeToken={challenge.challengeToken}
                  onCancel={resetChallenge}
                  onComplete={(result) => (result.user ? finishLogin(result.user) : resetChallenge())}
                />
              ) : (
                <MfaCodeStep
                  challengeToken={challenge.challengeToken}
                  onCancel={resetChallenge}
                  onVerified={finishLogin}
                />
              )}
            </>
  ) : (
    <LoginFields flow={flow} />
  );
}
