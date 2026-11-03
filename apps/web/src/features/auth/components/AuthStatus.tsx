import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type AuthStatusTone = "error" | "info" | "loading" | "success";

const TONES: Record<AuthStatusTone, { Icon: typeof AlertCircle; frame: string }> = {
  error: { Icon: AlertCircle, frame: "bg-app-danger-soft text-app-danger-ink" },
  info: { Icon: MailCheck, frame: "bg-primary-soft text-primary-ink" },
  loading: { Icon: Loader2, frame: "bg-app-soft text-app-muted" },
  success: { Icon: CheckCircle2, frame: "bg-success-soft text-success-ink" }
};

type AuthStatusProps = {
  tone: AuthStatusTone;
  title: string;
  children?: ReactNode;
  /** Buttons or links under the message. */
  actions?: ReactNode;
  /** `h1` when the status is the whole card; `h2` under a card heading. */
  headingLevel?: "h1" | "h2";
};

/** Outcome of an auth step inside the card: sent, verified, expired link, waiting. */
export function AuthStatus({
  tone,
  title,
  children,
  actions,
  headingLevel = "h1"
}: AuthStatusProps) {
  const { Icon, frame } = TONES[tone];
  const Heading = headingLevel;

  return (
    <div
      aria-live={tone === "error" ? "assertive" : "polite"}
      className="flex flex-col items-center gap-4 py-2 text-center"
      role={tone === "error" ? "alert" : "status"}
    >
      <span className={cn("flex size-12 items-center justify-center rounded-full", frame)}>
        <Icon
          aria-hidden="true"
          className={cn("size-6", tone === "loading" && "motion-safe:animate-spin")}
          strokeWidth={2.25}
        />
      </span>
      <div className="grid gap-1.5">
        <Heading
          className={cn(
            "font-extrabold leading-tight tracking-tight text-app-text",
            headingLevel === "h1" ? "text-2xl" : "text-lg"
          )}
        >
          {title}
        </Heading>
        {children ? <div className="text-sm text-app-muted">{children}</div> : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">{actions}</div>
      ) : null}
    </div>
  );
}
