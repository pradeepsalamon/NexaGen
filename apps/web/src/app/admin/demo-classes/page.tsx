import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DemoClassesClient } from "../../../features/admin/components/DemoClassesClient";

const accessTokenCookieName = "nexa_access_token";

export default function AdminDemoClassesPage() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);

  if (!hasAccessToken) {
    redirect("/login?next=/admin/demo-classes");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <DemoClassesClient />
    </div>
  );
}
