"use client";

import type { ReactNode } from "react";
import { AuthCard, AuthFrame } from "../frame/AuthFrame";

/**
 * The auth frame around one card, for a signed-out page outside the `(auth)` route group
 * (unsubscribe). Pages inside the group render only `AuthCard`: the group's layout already
 * holds the frame, so it stays still between them.
 */
export function AuthSplitShell({ children }: { children: ReactNode }) {
  return (
    <AuthFrame>
      <AuthCard>{children}</AuthCard>
    </AuthFrame>
  );
}
