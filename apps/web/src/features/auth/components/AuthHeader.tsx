import type { ReactNode } from "react";

type AuthHeaderProps = {
  title: string;
  description?: ReactNode;
};

/** The auth card's heading: the page's only `h1`. */
export function AuthHeader({ title, description }: AuthHeaderProps) {
  return (
    <div className="mb-6 grid gap-1.5">
      <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">
        {title}
      </h1>
      {description ? <p className="text-sm text-app-muted">{description}</p> : null}
    </div>
  );
}
