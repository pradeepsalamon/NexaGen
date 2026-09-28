import Link from "next/link";

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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="mb-1 text-2xl font-extrabold leading-tight text-app-text sm:whitespace-nowrap sm:text-3xl">
          {title}
        </h2>
        <p className="m-0 text-sm leading-6 text-app-muted">
          {helperText} <Link className="font-semibold text-primary-ink hover:underline" href={actionHref}>{actionLabel}</Link>
        </p>
      </div>
      {rightContent && <div className="shrink-0 self-center sm:self-auto">{rightContent}</div>}
    </div>
  );
}
