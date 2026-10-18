import { SpectatorRoomClient } from "@/features/live-monitor/components/SpectatorRoomClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/live-classes/[classId]") };

export default async function AdminSpectateLiveClassPage(props: { params: Promise<{ classId: string }> }) {
  const { classId } = await props.params;
  return <SpectatorRoomClient classId={classId} />;
}
