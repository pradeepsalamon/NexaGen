"use client";

import { useSimul } from "../../../providers/SimulProvider";
import { SimulCoachView } from "./SimulCoachView";
import { SimulStartDialog } from "./SimulStartDialog";
import { SimulStudentBoard } from "./SimulStudentBoard";

/** Every simul surface for this viewer. Rendered once in `MeetingRoom`. */
export function SimulHost() {
  const { isManager } = useSimul();
  if (!isManager) return <SimulStudentBoard />;
  return (
    <>
      <SimulStartDialog />
      <SimulCoachView />
    </>
  );
}
