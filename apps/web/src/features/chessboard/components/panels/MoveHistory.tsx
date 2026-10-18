import { useBoardStore } from "../../context/BoardProvider";
import { useShallow } from "zustand/react/shallow";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { MoveTreeView } from "./MoveTreeView";

/**
 * The live board's move list. Moves played from an earlier position branch
 * into variations (see `createBoardStore`); only a coach or admin may promote
 * or delete a variation, or comment on a move — a promotion never happens by
 * just playing or selecting a move.
 */
export function MoveHistory() {
  const { tree, treeLinePath, historyIndex, goToPath, promoteVariation, deleteVariation, setMoveComment } =
    useBoardStore(
      useShallow((s) => ({
        tree: s.tree,
        treeLinePath: s.treeLinePath,
        historyIndex: s.historyIndex,
        goToPath: s.goToPath,
        promoteVariation: s.promoteVariation,
        deleteVariation: s.deleteVariation,
        setMoveComment: s.setMoveComment,
      })),
    );
  const role = useAuthStore((state) => state.user?.role);
  const canEdit = role === "COACH" || isStaffRole(role);
  const cursor = treeLinePath.slice(0, historyIndex + 1);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-control border border-app-border bg-app-background">
      <div className="flex items-center justify-between border-b border-app-border bg-app-soft px-4 py-2 text-sm font-semibold">
        <span>Moves</span>
      </div>
      <MoveTreeView
        className="flex-1"
        tree={tree}
        cursor={cursor}
        onSelect={goToPath}
        editable={canEdit}
        onPromote={promoteVariation}
        onDelete={deleteVariation}
        onComment={setMoveComment}
      />
    </div>
  );
}
