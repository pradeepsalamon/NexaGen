"use client";

import { ActivityLibraryTable } from "./ActivityLibraryTable";

/** A folder's MCQs and Playouts, shown under its puzzles: one folder tree holds all three. */
export function ActivityFolderSection({
  basePath,
  folderId,
  role
}: {
  basePath: string;
  folderId: string;
  role: "admin" | "coach";
}) {
  return (
    <section className="space-y-2" aria-label="MCQs and Playouts in this folder">
      <h3 className="font-semibold text-app-text">MCQs in this folder</h3>
      <ActivityLibraryTable basePath={basePath} folderId={folderId} kind="MCQ" role={role} />
      <h3 className="pt-2 font-semibold text-app-text">Playouts in this folder</h3>
      <ActivityLibraryTable basePath={basePath} folderId={folderId} kind="PLAYOUT" role={role} />
    </section>
  );
}
