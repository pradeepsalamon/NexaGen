export type BoardPermissionMode = "VIEW_ONLY" | "EVERYONE" | "SELECTED_STUDENT" | "COACH_ONLY";

export interface SyncMessage {
  type: string;
  payload?: any;
}

export interface MovePayload {
  fen: string;
  pgn: string;
  moveType?: "move" | "capture" | "check" | "gameEnd";
  move?: {
    from: string;
    to: string;
    promotion?: string;
  };
}

export interface AnnotationPayload {
  arrows: string[][]; // e.g. [["e2", "e4"]]
  squares: Record<string, { background: string }>; // e.g. { e4: { background: "red" } }
}

export interface BoardSyncMessage extends SyncMessage {
  type: "MOVE" | "RESET" | "UNDO" | "REDO" | "FORCE_SYNC" | "UPDATE_ANNOTATIONS" | "UPDATE_PERMISSIONS" | "REQUEST_SYNC" | "REQUEST_CONTROL";
  payload?: 
    | MovePayload 
    | AnnotationPayload 
    | { mode: BoardPermissionMode; selectedStudentId?: string }
    | { fen: string; pgn: string; orientation: "white" | "black"; moveType?: "move" | "capture" | "check" | "gameEnd" }
    | { studentId: string; studentName: string }
    | any;
}
