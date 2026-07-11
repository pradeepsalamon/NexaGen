import Link from "next/link";
import { Logo } from "@/components/Logo";

type AuthHeaderProps = {
  actionHref: string;
  actionLabel: string;
  helperText: string;
  title: string;
  rightContent?: React.ReactNode;
};

export function AuthHeader({
  actionHref,
  actionLabel,
  helperText,
  title,
  rightContent
}: AuthHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="mb-2 text-[clamp(1.55rem,6vw,2.15rem)] font-extrabold leading-tight text-app-text">
          {title}
        </h2>
        <p className="m-0 text-sm leading-6 text-app-muted">
          {helperText} <Link className="font-semibold text-primary hover:underline" href={actionHref}>{actionLabel}</Link>
        </p>
      </div>
      {rightContent && <div>{rightContent}</div>}
    </div>
  );
}
