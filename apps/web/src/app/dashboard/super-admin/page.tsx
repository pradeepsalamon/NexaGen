import {
  BarChart3,
  CalendarDays,
  ShieldCheck,
  UserRoundCheck
} from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const accessTokenCookieName = "nexagen_access_token";

const metrics = [
  { icon: UserRoundCheck, label: "Active students", value: "186" },
  { icon: CalendarDays, label: "Classes this week", value: "24" },
  { icon: BarChart3, label: "Practice submissions", value: "412" }
];

export default function SuperAdminDashboardPage() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);

  if (!hasAccessToken) {
    redirect("/login?next=/dashboard/super-admin");
  }

  return (
    <main className="min-h-[calc(100vh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-5">
        <header className="flex flex-wrap items-center justify-end gap-4 rounded-panel border border-app-border bg-app-surface p-4 shadow-card">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex min-h-11 items-center gap-2 rounded-control bg-[color-mix(in_srgb,var(--color-primary)_12%,var(--color-surface))] px-3 py-2 text-sm font-extrabold text-primary">
              <ShieldCheck aria-hidden="true" className="size-4" />
              Super Admin
            </div>
          </div>
        </header>

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-panel border border-app-border bg-app-surface p-5 shadow-card">
            <p className="text-xs font-extrabold uppercase text-primary">
              Protected sample route
            </p>
            <h1 className="mt-3 max-w-2xl text-[clamp(2rem,5vw,3.6rem)] font-extrabold leading-none text-app-text">
              Super admin dashboard
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-app-muted sm:text-base">
              This route is gated by the planned HTTP-only access token cookie.
              When JWT verification is implemented, this page should also verify
              the token role is `SUPER_ADMIN`.
            </p>
          </div>

          <aside className="rounded-panel border border-app-border bg-app-surface p-5 shadow-card">
            <h2 className="text-base font-extrabold text-app-text">
              Access check
            </h2>
            <p className="mt-2 text-sm leading-6 text-app-muted">
              Cookie gate passed for `nexagen_access_token`.
            </p>
          </aside>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {metrics.map((metric) => {
            const Icon = metric.icon;

            return (
              <article
                className="rounded-app border border-app-border bg-app-surface p-5 shadow-card"
                key={metric.label}
              >
                <Icon
                  aria-hidden="true"
                  className="size-5 text-primary"
                  strokeWidth={2.5}
                />
                <p className="mt-5 text-sm font-bold text-app-muted">
                  {metric.label}
                </p>
                <strong className="mt-2 block text-3xl font-extrabold text-app-text">
                  {metric.value}
                </strong>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
