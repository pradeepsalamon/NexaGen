"use client";

import { useIsBoardViewport } from "../../../hooks/useIsBoardViewport";
import { useMatch } from "../../../providers/MatchProvider";
import { LazyView, MatchCoachView } from "../lazyViews";
import { MatchStartDialog } from "./MatchStartDialog";
import { MatchStudentView } from "./MatchStudentView";

/** Every student-match surface for this viewer. Rendered once in `MeetingRoom`; the classroom layout shows the boards as a stage tab instead. */
export function MatchHost() {
  const { isManager } = useMatch();
  const wide = useIsBoardViewport();
  if (!isManager) return wide ? null : <MatchStudentView />;
  return (
    <>
      <MatchStartDialog />
      {wide ? null : (
        <LazyView>
          <MatchCoachView />
        </LazyView>
      )}
    </>
  );
}
