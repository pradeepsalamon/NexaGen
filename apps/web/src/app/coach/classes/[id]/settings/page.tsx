import { ClassSettingsClient } from "@/features/coach/components/ClassSettingsClient";

export const metadata = {
  title: "Class settings - Coach Workspace",
};

export default function CoachClassSettingsPage({ params }: { params: { id: string } }) {
  return <ClassSettingsClient classId={params.id} />;
}
