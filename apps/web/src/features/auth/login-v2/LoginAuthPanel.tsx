"use client";

import { motion } from "framer-motion";
import { Lock, Mail } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useLoginFlow } from "../hooks/useLoginFlow";
import { MfaCodeStep } from "../components/mfa/MfaCodeStep";
import { MfaEnrollment } from "../components/mfa/MfaEnrollment";

/**
 * The card's heading: the page's only `h1`. `AuthHeader`'s layout in the login v2 serif.
 */
function CardHeading({ description, title }: { description: ReactNode; title: string }) {
  return (
    <div className="mb-6 grid gap-1.5">
      <h1 className="login-v2-serif text-3xl font-bold leading-tight tracking-tight text-app-text sm:text-4xl">
        {title}
      </h1>
      <p className="text-sm text-app-muted">{description}</p>
    </div>
  );
}

function LoginFields({ flow }: { flow: ReturnType<typeof useLoginFlow> }) {
  const { errors, handleSubmit, isPending, lockout, touchField, updateField, values } = flow;

  return (
    <>
      <CardHeading
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
            onBlur={() => touchField("email")}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="name@example.com"
            required
            type="email"
            value={values.email}
          />
        </FormField>

        <FormField error={errors.password ?? lockout ?? undefined} id="password" label="Password">
          <PasswordInput
            autoComplete="current-password"
            hasError={Boolean(errors.password ?? lockout)}
            id="password"
            leadingIcon={<Lock strokeWidth={2.25} />}
            onBlur={() => touchField("password")}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder="Enter your password"
            required
            value={values.password}
          />
        </FormField>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
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

        {/* The standard primary button; only its fill is login v2's gold. */}
        <Button
          className="login-v2-cta border-transparent text-login-on-gold"
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

function FooterLinks() {
  const links = [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
    // /help needs a session; signed-out visitors reach the team from the academy page.
    { href: "/#contact", label: "Help" }
  ];

  return (
    <footer className="flex justify-center text-sm text-app-muted lg:justify-end">
      <nav aria-label="Legal and help">
        <ul className="flex items-center">
          {links.map((link, index) => (
            <li className={index > 0 ? "border-l border-app-border pl-4 ml-4" : undefined} key={link.href}>
              <Link className="font-medium text-app-muted transition-colors hover:text-app-text hover:underline" href={link.href}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}

/**
 * The form side: an ivory (dark: deep navy) panel holding the sign-in card, which
 * swaps to the MFA step when the account needs one, and the legal links.
 */
export function LoginAuthPanel() {
  const flow = useLoginFlow();
  const { challenge, finishLogin, resetChallenge } = flow;
  const enrolling = challenge?.mfaRequired === "SETUP";

  return (
    <div className="relative z-10 flex flex-1 flex-col px-4 pb-6 pt-8 sm:px-8 lg:px-10 lg:pb-8 lg:pt-12 xl:px-16">
      <div className="flex flex-1 items-center justify-center">
        <motion.div
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="w-full max-w-md rounded-panel border border-app-border bg-login-card p-5 shadow-card sm:p-8"
          initial={{ opacity: 0, scale: 0.98, y: 18 }}
          transition={{ delay: 0.1, duration: 0.55, ease: "easeOut" }}
        >
          {challenge ? (
            <>
              <CardHeading
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
          )}
        </motion.div>
      </div>
      <div className="mx-auto mt-8 w-full max-w-md lg:max-w-none">
        <FooterLinks />
      </div>
    </div>
  );
}
