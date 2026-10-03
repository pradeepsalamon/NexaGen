"use client";

import { useMatch } from "../../../providers/MatchProvider";
import { MatchCoachView } from "./MatchCoachView";
import { MatchStartDialog } from "./MatchStartDialog";
import { MatchStudentView } from "./MatchStudentView";

/** Every student-match surface for this viewer. Rendered once in `MeetingRoom`. */
export function MatchHost() {
  const { isManager } = useMatch();
  if (!isManager) return <MatchStudentView />;
  return (
    <>
      <MatchStartDialog />
      <MatchCoachView />
    </>
  );
}
