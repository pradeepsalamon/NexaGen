import { SpectatorRoomClient } from "@/features/live-monitor/components/SpectatorRoomClient";

export default async function AdminSpectateLiveClassPage(props: { params: Promise<{ classId: string }> }) {
  const { classId } = await props.params;
  return <SpectatorRoomClient classId={classId} />;
}
