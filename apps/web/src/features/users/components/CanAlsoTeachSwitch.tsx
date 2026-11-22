"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { getCurrentUser } from "@/features/auth/api/authApi";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { useAuthStore } from "@/stores/authStore";
import { setExtraRoles } from "../api/userApi";

/**
 * "Can also teach" (docs/MULTI_ROLE_ACCOUNTS.md §5.6): a super admin lets an
 * admin account act as a coach too. The account then switches between admin
 * view and coach view from its user menu. Shown to super admins only; the API
 * enforces it (and the plan's coach seats, a 402 the toast explains).
 */
export function CanAlsoTeachSwitch({ user }: { user: AuthUser }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const viewer = useAuthStore((state) => state.user);
  const setViewer = useAuthStore((state) => state.setUser);
  const [canTeach, setCanTeach] = useState(Boolean(user.extraRoles?.includes("COACH")));
  const [keptBatches, setKeptBatches] = useState<{ id: string; name: string }[]>([]);

  const mutation = useMutation({
    mutationFn: (next: boolean) => setExtraRoles(user.id, { extraRoles: next ? ["COACH"] : [] }),
    onSuccess: async (result) => {
      const next = Boolean(result.user.extraRoles?.includes("COACH"));
      setCanTeach(next);
      setKeptBatches(result.coachedBatches);
      toast.success({
        message: next
          ? `${result.user.firstName} can switch to coach view from the user menu.`
          : `${result.user.firstName} no longer has a coach view.`,
        title: next ? "Can also teach" : "Coach view removed"
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      // Your own account: refresh the session so the role switch shows up (or goes) at once.
      if (viewer?.id === result.user.id) {
        const { user: me } = await getCurrentUser();
        setViewer(me);
      }
    }
  });

  if (viewer?.role !== "SUPER_ADMIN" || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    return null;
  }

  return (
    <Card className="grid gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <h3 className="text-base font-extrabold text-app-text">Can also teach</h3>
          <p className="mt-1 text-sm text-app-muted">
            Adds a coach view to this login, so the same person can run the academy and teach classes. It takes one
            coach seat on your plan. They act in one role at a time and switch from the user menu.
          </p>
        </div>
        <Switch
          aria-label="Can also teach"
          checked={canTeach}
          disabled={mutation.isPending}
          onCheckedChange={(next) => mutation.mutate(next)}
        />
      </div>
      {keptBatches.length > 0 && (
        <Alert title="These batches still list them as coach" variant="warning">
          {keptBatches.map((batch) => batch.name).join(", ")}. Assign another coach to each batch if they should stop
          teaching it.
        </Alert>
      )}
    </Card>
  );
}
