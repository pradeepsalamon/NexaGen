"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatConversationDetail } from "@nexa-chess/types";
import { Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { useChatContacts, useUpdateChatGroupMembers } from "../hooks/useChat";

type Props = {
  conversation: ChatConversationDetail;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  COACH: "Coach",
  STUDENT: "Student",
  SUPER_ADMIN: "Admin",
};

/**
 * Members of a batch / group thread. A group's owner (or an admin) ticks who is
 * in it and saves; a batch thread's roster follows the batch, so it is read-only.
 */
export function ChatMembersDialog({ conversation, onOpenChange, open }: Props) {
  const manage = conversation.type === "GROUP" && conversation.canManageMembers;
  const contacts = useChatContacts(open && manage);
  const update = useUpdateChatGroupMembers(conversation.id);

  const currentIds = useMemo(
    () => new Set(conversation.members.filter((m) => !m.owner).map((m) => m.id)),
    [conversation.members],
  );
  const [selected, setSelected] = useState<Set<string>>(currentIds);
  useEffect(() => {
    if (open) setSelected(new Set(currentIds));
  }, [open, currentIds]);

  // Candidates = the coach's students plus anyone already in the group.
  const candidates = useMemo(() => {
    const map = new Map<string, { id: string; name: string; detail: string }>();
    for (const m of conversation.members) {
      if (!m.owner) map.set(m.id, { detail: ROLE_LABEL[m.role] ?? m.role, id: m.id, name: m.name });
    }
    for (const c of contacts.data?.groupCandidates ?? []) {
      map.set(c.id, { detail: c.batchNames.join(", ") || "Student", id: c.id, name: c.name });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [conversation.members, contacts.data]);

  const add = [...selected].filter((id) => !currentIds.has(id));
  const remove = [...currentIds].filter((id) => !selected.has(id));
  const dirty = add.length + remove.length > 0;

  const save = () => {
    // undo: intentionally excluded — a Save in a dialog; reopening it is the correction.
    update.mutate(
      { add, remove },
      {
        onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update the group."),
        onSuccess: () => {
          toast.success("Group members updated.");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{manage ? "Group members" : "Members"}</DialogTitle>
          <DialogDescription>
            {conversation.type === "BATCH"
              ? "Everyone currently in this batch can read and write here."
              : manage
                ? "Tick who belongs in this group. Removed students keep no access to it."
                : "People in this group."}
          </DialogDescription>
        </DialogHeader>

        {manage ? (
          <div className="space-y-1">
            {conversation.members
              .filter((m) => m.owner)
              .map((m) => (
                <div className="flex items-center gap-3 rounded-control px-2 py-2" key={m.id}>
                  <Crown aria-hidden className="size-4 text-secondary-ink" />
                  <span className="flex-1 text-sm font-semibold text-app-text">{m.name}</span>
                  <Badge variant="secondary">Owner</Badge>
                </div>
              ))}
            {contacts.isLoading && (
              <p className="flex items-center gap-2 px-2 py-2 text-sm text-app-muted">
                <Loader2 className="size-4 animate-spin" /> Loading students…
              </p>
            )}
            {candidates.map((c) => (
              <label
                className="flex cursor-pointer items-center gap-3 rounded-control px-2 py-2 hover:bg-app-soft"
                htmlFor={`member-${c.id}`}
                key={c.id}
              >
                <Checkbox
                  checked={selected.has(c.id)}
                  id={`member-${c.id}`}
                  onCheckedChange={(v) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (v === true) next.add(c.id);
                      else next.delete(c.id);
                      return next;
                    })
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-app-text">{c.name}</span>
                  <span className="block truncate text-xs text-app-muted">{c.detail}</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <ul className="space-y-1">
            {conversation.members.map((m) => (
              <li className="flex items-center gap-3 rounded-control px-2 py-2" key={m.id}>
                <span className="flex-1 truncate text-sm font-medium text-app-text">{m.name}</span>
                {m.owner ? <Badge variant="secondary">Owner</Badge> : <Badge variant="outline">{ROLE_LABEL[m.role] ?? m.role}</Badge>}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            {manage ? "Cancel" : "Close"}
          </Button>
          {manage && (
            <Button disabled={!dirty || update.isPending} onClick={save}>
              {update.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
