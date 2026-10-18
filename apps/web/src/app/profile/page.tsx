import { AppShell } from "@/components/layout/AppShell";
import { LogoutButton } from "../../features/auth/components/LogoutButton";
import { ProfileForm } from "../../features/auth/components/ProfileForm";
import { ProfileRoleHeading } from "../../features/auth/components/ProfileRoleHeading";
import { TwoFactorSettings } from "../../features/auth/components/mfa/TwoFactorSettings";
import { AccountDeletionSection } from "@/features/privacy/components/AccountDeletionSection";
import { PersonalDataSection } from "@/features/privacy/components/PersonalDataSection";
import { UserTypographySettings } from "@/features/typography/components/UserTypographySettings";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/profile") };

export default function ProfilePage() {
  return (
    <AppShell>
      <main className="min-h-[calc(100dvh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-4xl rounded-panel border border-app-border bg-app-surface p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <ProfileRoleHeading />
              <p className="mt-2 max-w-2xl text-sm leading-6 text-app-muted">
                Your account details, sign-in security, text size and data.
              </p>
            </div>
            <LogoutButton />
          </div>
          <ProfileForm />
        </section>
        <TwoFactorSettings />
        <section
          aria-labelledby="text-settings-heading"
          className="mx-auto mt-5 max-w-4xl rounded-panel border border-app-border bg-app-surface p-5 shadow-card"
        >
          <h2 className="text-lg font-bold text-app-text" id="text-settings-heading">
            Text &amp; fonts
          </h2>
          <p className="mb-5 mt-1 text-sm text-app-muted">
            Choose the fonts and text size that are easiest for you to read. This only changes what
            you see.
          </p>
          <UserTypographySettings />
        </section>
        <PersonalDataSection />
        <AccountDeletionSection />
      </main>
    </AppShell>
  );
}
