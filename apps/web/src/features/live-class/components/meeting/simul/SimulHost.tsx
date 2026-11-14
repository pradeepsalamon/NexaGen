"use client";

import { useIsBoardViewport } from "../../../hooks/useIsBoardViewport";
import { useSimul } from "../../../providers/SimulProvider";
import { SimulCoachView } from "./SimulCoachView";
import { SimulStartDialog } from "./SimulStartDialog";
import { SimulStudentBoard } from "./SimulStudentBoard";

/** Every simul surface for this viewer. Rendered once in `MeetingRoom`; the classroom layout shows the boards as a stage tab instead. */
export function SimulHost() {
  const { isManager } = useSimul();
  const wide = useIsBoardViewport();
  if (!isManager) return wide ? null : <SimulStudentBoard />;
  return (
    <>
      <SimulStartDialog />
      {wide ? null : <SimulCoachView />}
    </>
  );
}
