import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "../../components/layout/AppShell";
import { LogoutButton } from "../../features/auth/components/LogoutButton";
import { ProfileForm } from "../../features/auth/components/ProfileForm";
import { ProfileRoleHeading } from "../../features/auth/components/ProfileRoleHeading";

const accessTokenCookieName = "nexagen_access_token";

export default function ProfilePage() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);

  if (!hasAccessToken) {
    redirect("/login?next=/profile");
  }

  return (
    <AppShell>
      <main className="min-h-[calc(100vh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-4xl rounded-panel border border-app-border bg-app-surface p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <ProfileRoleHeading />
              <p className="mt-3 max-w-2xl text-sm leading-6 text-app-muted">
                Your profile workspace is ready for account details as the admin
                experience grows.
              </p>
            </div>
            <LogoutButton />
          </div>
          <ProfileForm />
        </section>
      </main>
    </AppShell>
  );
}
