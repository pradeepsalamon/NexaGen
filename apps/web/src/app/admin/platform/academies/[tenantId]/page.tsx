import { PlatformOperatorOnly } from "@/components/layout/PlatformOperatorOnly";
import { AcademyDetailClient } from "@/features/platform/components/AcademyDetailClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/platform/academies/[tenantId]") };

export default async function PlatformAcademyPage(props: { params: Promise<{ tenantId: string }> }) {
  const params = await props.params;
  return (
    <PlatformOperatorOnly>
      <AcademyDetailClient tenantId={params.tenantId} />
    </PlatformOperatorOnly>
  );
}
