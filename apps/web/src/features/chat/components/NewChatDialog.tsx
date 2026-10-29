"use client";

import { useEffect, useState } from "react";
import { CHAT_GROUP_NAME_MAX_LENGTH, type ChatContact } from "@nexa-chess/types";
import { Loader2, MessageCirclePlus, Search } from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useChatContacts, useCreateChatGroup, useStartDirectChat } from "../hooks/useChat";
import { initialsOf } from "../lib/chatFormat";

type Props = {
  /** Coaches may make groups; students only ever message a coach. */
  canCreateGroup: boolean;
  onOpenChange: (open: boolean) => void;
  onOpened: (conversationId: string) => void;
  open: boolean;
};

// undo: intentionally excluded — opening a direct thread is an idempotent lookup,
// and a new group has no delete endpoint (members can be edited afterwards).
export function NewChatDialog({ canCreateGroup, onOpenChange, onOpened, open }: Props) {
  const [tab, setTab] = useState<"direct" | "group">("direct");
  const [q, setQ] = useState("");
  const debounced = useDebouncedValue(q.trim(), 300);
  const contacts = useChatContacts(open, debounced || undefined);
  const startDirect = useStartDirectChat();
  const createGroup = useCreateChatGroup();
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setQ("");
      setGroupName("");
      setMembers(new Set());
      setTab("direct");
    }
  }, [open]);

  const openDirect = (contact: ChatContact) => {
    startDirect.mutate(contact.id, {
      onError: (err) => toast.error(err instanceof Error ? err.message : "Could not open the conversation."),
      onSuccess: (detail) => {
        onOpenChange(false);
        onOpened(detail.id);
      },
    });
  };

  const submitGroup = () => {
    createGroup.mutate(
      { memberIds: [...members], name: groupName.trim() },
      {
        onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create the group."),
        onSuccess: (detail) => {
          toast.success(`Group "${detail.title}" created.`);
          onOpenChange(false);
          onOpened(detail.id);
        },
      },
    );
  };

  const searchBox = (
    <div className="relative">
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
      <Input
        aria-label="Search people"
        className="pl-9"
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name"
        value={q}
      />
    </div>
  );

  const list = contacts.data?.contacts ?? [];
  const candidates = contacts.data?.groupCandidates ?? [];

  const direct = (
    <div className="space-y-3">
      {searchBox}
      <ul className="max-h-[50dvh] space-y-1 overflow-y-auto">
        {contacts.isLoading && (
          <li className="flex items-center gap-2 px-2 py-3 text-sm text-app-muted">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </li>
        )}
        {!contacts.isLoading && list.length === 0 && (
          <li className="px-2 py-6 text-center text-sm text-app-muted">
            {debounced ? "Nobody matches that name." : "There is nobody you can message yet."}
          </li>
        )}
        {list.map((c) => (
          <li key={c.id}>
            <button
              className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-app-soft disabled:opacity-60"
              disabled={startDirect.isPending}
              onClick={() => openDirect(c)}
              type="button"
            >
              <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
                {initialsOf(c.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-app-text">{c.name}</span>
                <span className="block truncate text-xs text-app-muted">
                  {c.batchNames.length ? c.batchNames.join(", ") : c.role === "COACH" ? "Coach" : "Student"}
                </span>
              </span>
              {startDirect.isPending && startDirect.variables === c.id && <Loader2 className="size-4 animate-spin text-app-muted" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCirclePlus aria-hidden className="size-5 text-primary-ink" />
            New conversation
          </DialogTitle>
          <DialogDescription>
            {canCreateGroup
              ? "Message one student, or make a group from students in your batches."
              : "Message a coach of one of your batches, or the academy team."}
          </DialogDescription>
        </DialogHeader>

        {canCreateGroup ? (
          <Tabs onValueChange={(v) => setTab(v as "direct" | "group")} value={tab}>
            <TabsList className="w-full">
              <TabsTrigger className="flex-1" value="direct">
                Direct message
              </TabsTrigger>
              <TabsTrigger className="flex-1" value="group">
                New group
              </TabsTrigger>
            </TabsList>
            <TabsContent className="pt-3" value="direct">
              {direct}
            </TabsContent>
            <TabsContent className="space-y-3 pt-3" value="group">
              <div className="space-y-1.5">
                <Label htmlFor="chat-group-name">Group name</Label>
                <Input
                  id="chat-group-name"
                  maxLength={CHAT_GROUP_NAME_MAX_LENGTH}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Endgame squad"
                  value={groupName}
                />
              </div>
              {searchBox}
              <ul className="max-h-[40dvh] space-y-1 overflow-y-auto" aria-label="Students">
                {candidates.length === 0 && !contacts.isLoading && (
                  <li className="px-2 py-6 text-center text-sm text-app-muted">No students found.</li>
                )}
                {candidates.map((c) => (
                  <li key={c.id}>
                    <label
                      className="flex cursor-pointer items-center gap-3 rounded-control px-2 py-2 hover:bg-app-soft"
                      htmlFor={`group-${c.id}`}
                    >
                      <Checkbox
                        checked={members.has(c.id)}
                        id={`group-${c.id}`}
                        onCheckedChange={(v) =>
                          setMembers((prev) => {
                            const next = new Set(prev);
                            if (v === true) next.add(c.id);
                            else next.delete(c.id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-app-text">{c.name}</span>
                        <span className="block truncate text-xs text-app-muted">{c.batchNames.join(", ")}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <DialogFooter>
                <span className="mr-auto self-center text-xs text-app-muted">{members.size} selected</span>
                <Button
                  disabled={!groupName.trim() || members.size === 0 || createGroup.isPending}
                  onClick={submitGroup}
                >
                  {createGroup.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                  Create group
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        ) : (
          direct
        )}
      </DialogContent>
    </Dialog>
  );
}
