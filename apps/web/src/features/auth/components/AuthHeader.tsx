import Link from "next/link";
import { Logo } from "@/components/Logo";

type AuthHeaderProps = {
  actionHref: string;
  actionLabel: string;
  helperText: string;
  title: string;
};

export function AuthHeader({
  actionHref,
  actionLabel,
  helperText,
  title
}: AuthHeaderProps) {
  return (
    <div className="mb-5 grid gap-4 lg:mb-6">
      <div className="lg:hidden">
        <Logo compact />
      </div>
      <div>
        <h2 className="mb-2 text-[clamp(1.55rem,6vw,2.15rem)] font-extrabold leading-tight text-app-text">
          {title}
        </h2>
        <p className="m-0 text-sm leading-6 text-app-muted">
          {helperText} <Link href={actionHref}>{actionLabel}</Link>
        </p>
      </div>
    </div>
  );
}
