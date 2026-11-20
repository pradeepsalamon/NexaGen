import { useBoardStore } from "../../context/BoardProvider";
import { useShallow } from "zustand/react/shallow";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { MoveTreeView } from "./MoveTreeView";

/**
 * The live board's move list. Moves played from an earlier position branch
 * into variations (see `createBoardStore`); only a coach or admin may promote
 * or delete a variation, or annotate a move (glyphs and a comment, which reach
 * the class with the tree) — a promotion never happens by just playing or
 * selecting a move.
 */
export function MoveHistory({
  layout,
  evaluations,
  embedded = false,
}: {
  /** See `MoveTreeView`: `rows` lists one move pair per row. */
  layout?: "flow" | "rows";
  /** Formatted evaluations by FEN, shown beside each move (rows layout). */
  evaluations?: Readonly<Record<string, string>>;
  /**
   * Just the list, straight under whatever sits above it (the classroom's
   * engine analysis): no "Moves" title bar and no frame. The coach still gets
   * the action bar (Annotate, and the variation actions inside a variation).
   */
  embedded?: boolean;
} = {}) {
  const { tree, treeLinePath, historyIndex, goToPath, promoteVariation, deleteVariation, setMoveComment, toggleMoveNag } =
    useBoardStore(
      useShallow((s) => ({
        tree: s.tree,
        treeLinePath: s.treeLinePath,
        historyIndex: s.historyIndex,
        goToPath: s.goToPath,
        promoteVariation: s.promoteVariation,
        deleteVariation: s.deleteVariation,
        setMoveComment: s.setMoveComment,
        toggleMoveNag: s.toggleMoveNag,
      })),
    );
  const role = useAuthStore((state) => state.user?.role);
  const canEdit = role === "COACH" || isStaffRole(role);
  const cursor = treeLinePath.slice(0, historyIndex + 1);

  if (embedded) {
    return (
      <MoveTreeView
        className="h-full"
        tree={tree}
        cursor={cursor}
        onSelect={goToPath}
        editable={canEdit}
        onPromote={promoteVariation}
        onDelete={deleteVariation}
        onComment={setMoveComment}
        onToggleNag={toggleMoveNag}
        layout={layout}
        evaluations={evaluations}
      />
    );
  }

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
        onToggleNag={toggleMoveNag}
        layout={layout}
        evaluations={evaluations}
      />
    </div>
  );
}
