"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Flag,
  ListPlus,
  Pencil,
  Plus,
  Rocket,
  Trash2
} from "lucide-react";
import {
  ACTIVITY_QUEUE_TITLE_MAX,
  MAX_ACTIVITY_QUEUE_ITEMS,
  type ActivityQueue,
  type ActivityQueueItem,
  type ActivityQueueItemInput
} from "@nexa-chess/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/AlertDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import {
  useActivityQueueDraftActions,
  useActivityQueues,
  useAdvanceActivityQueue,
  useFinishActivityQueue,
  useLaunchActivityQueue
} from "../../hooks/useActivityQueue";
import { ActivityQueueProgressGrid } from "./ActivityQueueProgressGrid";
import { ActivityKindIcon, activityKindLabel, QUEUE_STATUS_BADGE } from "./activityQueueUi";
import { QueuePuzzlePicker } from "./QueuePuzzlePicker";

/** Extra ways to add an activity, only available inside the live room. */
export type RoomQueueSources = {
  /** The shared board's position right now, for a "what would you play?" question. */
  boardFen: () => string | null;
  chapters: { id: string; title: string }[];
};

type Props = {
  classId: string;
  /** In the room: the board / chapter sources and live refetching. */
  room?: RoomQueueSources;
  /** Called with the activity the class just moved to (the room loads it onto the board). */
  onActivityStarted?: (item: ActivityQueueItem) => void;
  /** Where the coach handles a running question (close / reveal), e.g. "Open the Response tab". */
  questionAction?: ReactNode;
};

/**
 * The coach's activity queues for one class: draft a named sequence of
 * puzzles, questions and chapters, launch it once, then move the whole class
 * through it and watch every student's responses. Used inside the live room
 * (Queue tab) and on the class page before the class starts.
 */
export function ActivityQueueManager({ classId, room, onActivityStarted, questionAction }: Props) {
  const queues = useActivityQueues(classId, { live: !!room });
  const actions = useActivityQueueDraftActions(classId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const visible = useMemo(
    () => (queues.data?.queues ?? []).filter((q) => !actions.hiddenQueueIds.has(q.id)),
    [queues.data, actions.hiddenQueueIds]
  );
  // The running queue first; else what the coach picked; else the newest.
  const running = visible.find((q) => q.status === "LIVE") ?? null;
  const selected = visible.find((q) => q.id === selectedId) ?? running ?? visible[0] ?? null;

  useEffect(() => {
    if (running && selectedId !== running.id) setSelectedId(running.id);
    // Only follow a queue that starts running (e.g. launched from another tab).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running?.id]);

  const create = (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    void actions.create({ onCreated: setSelectedId, title: trimmed });
    setNewTitle("");
  };

  if (queues.isLoading) {
    return (
      <div className="space-y-2 p-1">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (queues.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-app-muted">
        Couldn&apos;t load the activity queues.
        <Button size="sm" variant="outline" onClick={() => void queues.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const classLive = queues.data?.classLive ?? false;

  return (
    <div className="space-y-4">
      {visible.length === 0 ? (
        <div className="space-y-3 rounded-app border border-app-border bg-app-soft p-3 text-sm text-app-muted">
          <p>
            Line up puzzles, questions and positions before the lesson, then launch the queue once and move the
            whole class through it together. You&apos;ll see every student&apos;s answers as they come in.
          </p>
          <NewQueueForm value={newTitle} onChange={setNewTitle} onSubmit={create} busy={actions.creating} />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Select
            aria-label="Activity queue"
            className="min-w-0 flex-1"
            value={selected?.id ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            options={visible.map((q) => ({
              label: `${q.title} · ${QUEUE_STATUS_BADGE[q.status].label}`,
              value: q.id
            }))}
          />
          <NewQueueButton onCreate={create} busy={actions.creating} />
        </div>
      )}

      {selected ? (
        <QueueView
          key={selected.id}
          classId={classId}
          classLive={classLive}
          queue={selected}
          room={room}
          actions={actions}
          anotherRunning={!!running && running.id !== selected.id}
          onActivityStarted={onActivityStarted}
          questionAction={questionAction}
        />
      ) : null}
    </div>
  );
}

function NewQueueForm({
  value,
  onChange,
  onSubmit,
  busy
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (title: string) => void;
  busy: boolean;
}) {
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <Input
        aria-label="Queue name"
        placeholder="e.g. Forks warm-up"
        maxLength={ACTIVITY_QUEUE_TITLE_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button type="submit" disabled={!value.trim() || busy} isLoading={busy}>
        Create
      </Button>
    </form>
  );
}

function NewQueueButton({ onCreate, busy }: { onCreate: (title: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  return (
    <>
      <SimpleTooltip label="New queue">
        <Button size="icon" variant="outline" className="rounded-full" aria-label="New queue" onClick={() => setOpen(true)}>
          <Plus className="size-4" strokeWidth={2.5} />
        </Button>
      </SimpleTooltip>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New activity queue</AlertDialogTitle>
            <AlertDialogDescription>Give it a name the class will see, like &ldquo;Forks warm-up&rdquo;.</AlertDialogDescription>
          </AlertDialogHeader>
          <NewQueueForm
            value={title}
            onChange={setTitle}
            busy={busy}
            onSubmit={(value) => {
              onCreate(value);
              setTitle("");
              setOpen(false);
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type DraftActions = ReturnType<typeof useActivityQueueDraftActions>;

function QueueView({
  classId,
  classLive,
  queue,
  room,
  actions,
  anotherRunning,
  onActivityStarted,
  questionAction
}: {
  classId: string;
  classLive: boolean;
  queue: ActivityQueue;
  room?: RoomQueueSources;
  actions: DraftActions;
  anotherRunning: boolean;
  onActivityStarted?: (item: ActivityQueueItem) => void;
  questionAction?: ReactNode;
}) {
  const [renaming, setRenaming] = useState(false);
  const status = QUEUE_STATUS_BADGE[queue.status];
  const items = queue.items.filter((i) => !actions.hiddenItemIds.has(i.id));

  return (
    <section className="space-y-3" aria-label={`Queue: ${queue.title}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {renaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const title = String(new FormData(e.currentTarget).get("title") ?? "").trim();
                setRenaming(false);
                if (title && title !== queue.title) void actions.rename({ queue, title });
              }}
            >
              <Input
                name="title"
                aria-label="Queue name"
                defaultValue={queue.title}
                maxLength={ACTIVITY_QUEUE_TITLE_MAX}
                autoFocus
                onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
              />
            </form>
          ) : (
            <h3 className="truncate font-display text-base font-bold text-app-text">{queue.title}</h3>
          )}
          <p className="text-xs text-app-muted">
            {items.length} {items.length === 1 ? "activity" : "activities"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant={status.variant}>{status.label}</Badge>
          {!renaming ? (
            <SimpleTooltip label="Rename">
              <Button size="icon" variant="ghost" className="size-8 rounded-full" aria-label="Rename queue" onClick={() => setRenaming(true)}>
                <Pencil className="size-3.5" strokeWidth={2.5} />
              </Button>
            </SimpleTooltip>
          ) : null}
          {queue.status !== "LIVE" ? (
            <SimpleTooltip label="Delete queue">
              <Button
                size="icon"
                variant="ghost"
                className="size-8 rounded-full text-app-danger-ink hover:bg-app-danger/10"
                aria-label="Delete queue"
                onClick={() => void actions.removeQueue(queue)}
              >
                <Trash2 className="size-3.5" strokeWidth={2.5} />
              </Button>
            </SimpleTooltip>
          ) : null}
        </div>
      </div>

      {queue.status === "DRAFT" ? (
        <DraftEditor
          classId={classId}
          classLive={classLive}
          queue={queue}
          items={items}
          room={room}
          actions={actions}
          anotherRunning={anotherRunning}
          onActivityStarted={onActivityStarted}
        />
      ) : (
        <Runner
          classId={classId}
          queue={queue}
          onActivityStarted={onActivityStarted}
          questionAction={questionAction}
        />
      )}
    </section>
  );
}

// ── Draft ──

function DraftEditor({
  classId,
  classLive,
  queue,
  items,
  room,
  actions,
  anotherRunning,
  onActivityStarted
}: {
  classId: string;
  classLive: boolean;
  queue: ActivityQueue;
  items: ActivityQueueItem[];
  room?: RoomQueueSources;
  actions: DraftActions;
  anotherRunning: boolean;
  onActivityStarted?: (item: ActivityQueueItem) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [confirmLaunch, setConfirmLaunch] = useState(false);
  const launch = useLaunchActivityQueue(classId);
  const spaceLeft = MAX_ACTIVITY_QUEUE_ITEMS - queue.items.length;
  const full = spaceLeft <= 0;
  const unavailable = items.filter((i) => !i.available).length;

  const add = (inputs: ActivityQueueItemInput[]) => actions.addItems({ items: inputs, queue });

  const move = (item: ActivityQueueItem, step: -1 | 1) => {
    // The server wants every id, including a row whose removal is still in its Undo window.
    const ids = queue.items.map((i) => i.id);
    const from = ids.indexOf(item.id);
    const neighbour = items[items.indexOf(item) + step];
    const to = neighbour ? ids.indexOf(neighbour.id) : -1;
    if (from < 0 || to < 0) return;
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    void actions.reorder({ ids: next, queue });
  };

  const launchBlocker = !classLive
    ? "Start the class to launch this queue. You can keep editing until then."
    : anotherRunning
      ? "Another queue is running in this class — finish it first."
      : items.length === 0
        ? "Add at least one activity first."
        : null;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="rounded-app border border-dashed border-app-border p-4 text-center text-sm text-app-muted">
          No activities yet. Add puzzles{room ? ", a question about the board, or a saved chapter" : ""}.
        </p>
      ) : (
        <ol className="space-y-1.5" aria-label="Activities in order">
          {items.map((item, index) => (
            <li
              key={item.id}
              className={cn(
                "flex items-center gap-2 rounded-app border border-app-border bg-app-surface px-2 py-1.5",
                !item.available && "border-warning/50"
              )}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-app-soft text-xs font-bold text-app-text">
                {index + 1}
              </span>
              <ActivityKindIcon kind={item.kind} className="text-app-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-app-text">{item.title}</span>
                <span className="block truncate text-xs text-app-muted">
                  {activityKindLabel(item.kind)}
                  {item.durationSeconds ? ` · ${Math.round(item.durationSeconds / 60)} min` : ""}
                  {!item.available ? " · no longer available" : ""}
                </span>
              </span>
              <IconAction label="Move up" disabled={index === 0} onClick={() => move(item, -1)}>
                <ArrowUp className="size-3.5" strokeWidth={2.5} />
              </IconAction>
              <IconAction label="Move down" disabled={index === items.length - 1} onClick={() => move(item, 1)}>
                <ArrowDown className="size-3.5" strokeWidth={2.5} />
              </IconAction>
              <IconAction label={`Remove ${item.title}`} danger onClick={() => void actions.removeItem({ item, queue })}>
                <Trash2 className="size-3.5" strokeWidth={2.5} />
              </IconAction>
            </li>
          ))}
        </ol>
      )}

      {unavailable > 0 ? (
        <p className="flex items-start gap-2 rounded-app border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-ink">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {unavailable === 1 ? "One activity is" : `${unavailable} activities are`} no longer available (unpublished or
          deleted). Remove {unavailable === 1 ? "it" : "them"}, or the class will skip past {unavailable === 1 ? "it" : "them"}.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {room ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={full || actions.adding}>
                <ListPlus className="size-4" /> Add activity
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem onSelect={() => setPickerOpen(true)}>Puzzles from the library…</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setQuestionOpen(true)}>Question about the current board…</DropdownMenuItem>
              {room.chapters.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Chapters</DropdownMenuLabel>
                  {room.chapters.map((chapter) => (
                    <DropdownMenuItem key={chapter.id} onSelect={() => void add([{ chapterId: chapter.id, kind: "CHAPTER" }])}>
                      <span className="truncate">{chapter.title}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button size="sm" variant="outline" disabled={full || actions.adding} onClick={() => setPickerOpen(true)}>
            <ListPlus className="size-4" /> Add puzzles
          </Button>
        )}
        <Button size="sm" disabled={!!launchBlocker || launch.isPending} isLoading={launch.isPending} onClick={() => setConfirmLaunch(true)}>
          <Rocket className="size-4" /> Launch for the class
        </Button>
      </div>
      {launchBlocker && items.length > 0 ? <p className="text-xs text-app-muted">{launchBlocker}</p> : null}
      {!room ? (
        <p className="text-xs text-app-muted">
          Questions about the board and saved chapters can be added from the Queue tab inside the live class.
        </p>
      ) : null}

      <QueuePuzzlePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        room={spaceLeft}
        busy={actions.adding}
        onAdd={(puzzleIds, durationSeconds) => {
          setPickerOpen(false);
          void add(puzzleIds.map((puzzleId) => ({ durationSeconds, kind: "PUZZLE" as const, puzzleId })));
        }}
      />
      {room ? (
        <QuestionDialog
          open={questionOpen}
          onOpenChange={setQuestionOpen}
          boardFen={room.boardFen}
          onAdd={(fen, prompt) => void add([{ fen, kind: "QUESTION", prompt: prompt || undefined }])}
        />
      ) : null}

      <AlertDialog open={confirmLaunch} onOpenChange={setConfirmLaunch}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Launch &ldquo;{queue.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The first activity goes to the whole class now, and you move everyone on together. A queue runs once —
              it can&apos;t be edited after launch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                launch.mutate(queue.id, {
                  onSuccess: ({ queue: launched }) => {
                    const current = launched.items.find((i) => i.id === launched.currentItemId);
                    if (current) onActivityStarted?.(current);
                  }
                })
              }
            >
              Launch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function QuestionDialog({
  open,
  onOpenChange,
  boardFen,
  onAdd
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardFen: () => string | null;
  onAdd: (fen: string, prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [fen, setFen] = useState<string | null>(null);
  useEffect(() => {
    // Frozen when the dialog opens: the question is about *this* position.
    if (open) {
      setFen(boardFen());
      setPrompt("");
    }
  }, [open, boardFen]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Add a question about this position</AlertDialogTitle>
          <AlertDialogDescription>
            When the class reaches it, each student privately plays one move on the board as it is now. You can mark
            the right move from the Response tab while it runs.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          aria-label="Question"
          placeholder="What would you play?"
          maxLength={200}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!fen} onClick={() => fen && onAdd(fen, prompt.trim())}>
            Add question
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  danger,
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <SimpleTooltip label={label}>
      <Button
        size="icon"
        variant="ghost"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={cn("size-8 shrink-0 rounded-full", danger && "text-app-danger-ink hover:bg-app-danger/10")}
      >
        {children}
      </Button>
    </SimpleTooltip>
  );
}

// ── Running / finished ──

function Runner({
  classId,
  queue,
  onActivityStarted,
  questionAction
}: {
  classId: string;
  queue: ActivityQueue;
  onActivityStarted?: (item: ActivityQueueItem) => void;
  questionAction?: ReactNode;
}) {
  const advance = useAdvanceActivityQueue(classId);
  const finish = useFinishActivityQueue(classId);
  const [confirmFinish, setConfirmFinish] = useState(false);

  const live = queue.status === "LIVE";
  const index = queue.items.findIndex((i) => i.id === queue.currentItemId);
  const current = index >= 0 ? queue.items[index] : null;
  const next = index >= 0 ? (queue.items[index + 1] ?? null) : null;
  const done = queue.items.filter((i) => i.completedAt).length;
  const busy = advance.isPending || finish.isPending;

  const goNext = () => {
    if (!current) return;
    advance.mutate(
      { fromItemId: current.id, queueId: queue.id },
      {
        onSuccess: ({ queue: moved }) => {
          const now = moved.items.find((i) => i.id === moved.currentItemId);
          if (now) onActivityStarted?.(now);
        }
      }
    );
  };

  return (
    <div className="space-y-4">
      {live && current ? (
        <>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-app-muted">
              <span>
                Activity {index + 1} of {queue.items.length}
              </span>
              <span>{done} done</span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-app-soft"
              role="progressbar"
              aria-label="Queue progress"
              aria-valuemin={0}
              aria-valuemax={queue.items.length}
              aria-valuenow={index + 1}
            >
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${((index + 1) / queue.items.length) * 100}%` }} />
            </div>
          </div>

          <div className="space-y-2 rounded-app border border-primary/40 bg-primary/5 p-3" aria-live="polite">
            <div className="flex items-center gap-2">
              <ActivityKindIcon kind={current.kind} className="text-primary-ink" />
              <span className="text-xs font-semibold uppercase tracking-wide text-primary-ink">
                Now · {activityKindLabel(current.kind)}
              </span>
            </div>
            <p className="font-semibold text-app-text">{current.title}</p>
            {current.activationError ? (
              <p className="flex items-start gap-2 text-xs text-warning-ink">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Couldn&apos;t start: {current.activationError} Move on to continue.
              </p>
            ) : current.kind === "PUZZLE" ? (
              <p className="text-xs text-app-muted">Students are solving it on their own boards — follow them in Live boards.</p>
            ) : current.kind === "QUESTION" ? (
              <div className="space-y-1.5">
                <p className="text-xs text-app-muted">Each student plays one move privately. Close and reveal the answers when you&apos;re ready.</p>
                {questionAction}
              </div>
            ) : (
              <p className="text-xs text-app-muted">The position is on the shared board — teach from it, then move on.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={goNext} disabled={busy} isLoading={advance.isPending} className="min-w-0 flex-1">
              {next ? (
                <>
                  <span className="truncate">Next: {next.title}</span>
                  <ChevronRight className="size-4 shrink-0" />
                </>
              ) : (
                <>
                  <Flag className="size-4" /> Finish queue
                </>
              )}
            </Button>
            {next ? (
              <Button variant="outline" onClick={() => setConfirmFinish(true)} disabled={busy}>
                End early
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="rounded-app border border-app-border bg-app-soft p-3 text-sm text-app-muted">
          This queue has finished — {done} of {queue.items.length} activities were run.
        </p>
      )}

      <ol className="space-y-1" aria-label="Activities">
        {queue.items.map((item, i) => {
          const isCurrent = item.id === queue.currentItemId;
          return (
            <li
              key={item.id}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-control px-2 py-1 text-sm",
                isCurrent ? "bg-primary/10 font-semibold text-primary-ink" : item.completedAt ? "text-app-muted" : "text-app-text"
              )}
            >
              <span className="w-5 shrink-0 text-right text-xs tabular-nums">{i + 1}</span>
              <ActivityKindIcon kind={item.kind} className="size-3.5" />
              <span className={cn("min-w-0 flex-1 truncate", item.completedAt && !isCurrent && "line-through decoration-app-muted/50")}>
                {item.title}
              </span>
              {item.activationError ? (
                <SimpleTooltip label={`Couldn't start: ${item.activationError}`}>
                  <span tabIndex={0} aria-label={`Couldn't start: ${item.activationError}`}>
                    <AlertTriangle className="size-3.5 text-warning-ink" />
                  </span>
                </SimpleTooltip>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-app-text">Responses</h4>
        <ActivityQueueProgressGrid classId={classId} queue={queue} />
      </div>

      <AlertDialog open={confirmFinish} onOpenChange={setConfirmFinish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End the queue now?</AlertDialogTitle>
            <AlertDialogDescription>
              The current activity closes for everyone and the rest are skipped. Responses so far are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction onClick={() => finish.mutate(queue.id)}>End queue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
