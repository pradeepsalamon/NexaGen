"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  createLibraryActivityRequestSchema,
  isSystemPuzzleFolder,
  type CreateLibraryActivityRequest,
  type LibraryActivityDto,
  type LibraryActivityKind,
  type McqConfig,
  type PlayoutConfig,
  type PuzzleDifficulty
} from "@nexa-chess/types";
import { FormPageShell } from "@/components/layout/FormPageShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/providers/ToastProvider";
import { useCreateActivity, useUpdateActivity } from "../../hooks/useActivitiesApi";
import { usePuzzleTopics } from "../../hooks/usePuzzlesApi";
import { PUZZLE_DIFFICULTY_OPTIONS, puzzleTopicOptions } from "../../lib/puzzleMeta";
import { emptyMcqConfig, McqEditor } from "./McqEditor";
import { emptyPlayoutConfig, PlayoutEditor } from "./PlayoutEditor";

const KIND_NAMES: Record<LibraryActivityKind, string> = { MCQ: "MCQ", PLAYOUT: "Playout" };

/** Create or edit an MCQ or a Playout. It is filed in the same folders as chess puzzles. */
export function ActivityForm({
  kind,
  activity,
  basePath
}: {
  kind: LibraryActivityKind;
  activity?: LibraryActivityDto;
  basePath: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateActivity();
  const update = useUpdateActivity(activity?.id ?? "");
  const saving = create.isPending || update.isPending;

  const [title, setTitle] = useState(activity?.title ?? "");
  const [description, setDescription] = useState(activity?.description ?? "");
  const [topicId, setTopicId] = useState(activity?.topicId ?? "");
  const [difficulty, setDifficulty] = useState<PuzzleDifficulty>(activity?.difficulty ?? "BEGINNER");
  const [topic, setTopic] = useState(activity?.topic ?? "");
  const [tagsText, setTagsText] = useState((activity?.tags ?? []).join(", "));
  const [mcq, setMcq] = useState<McqConfig>(() =>
    kind === "MCQ" && activity ? (activity.config as McqConfig) : emptyMcqConfig()
  );
  const [playout, setPlayout] = useState<PlayoutConfig>(() =>
    kind === "PLAYOUT" && activity ? (activity.config as PlayoutConfig) : emptyPlayoutConfig()
  );

  const topics = usePuzzleTopics();
  const folderOptions = useMemo(
    () => puzzleTopicOptions((topics.data?.topics ?? []).filter((t) => !isSystemPuzzleFolder(t))),
    [topics.data]
  );

  const save = async (publish: boolean) => {
    const body = {
      config: kind === "MCQ" ? mcq : playout,
      description: description.trim() || null,
      difficulty,
      kind,
      status: publish ? ("PUBLISHED" as const) : (activity?.status ?? ("DRAFT" as const)),
      tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
      title: title.trim(),
      topic: topic.trim() || null,
      topicId
    };
    // The same rules the API applies, so the admin hears about a gap before a round trip.
    const parsed = createLibraryActivityRequestSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      toast.error({
        message: issue.path[0] === "topicId" ? "Pick a folder for it." : issue.message,
        title: "Almost there"
      });
      return;
    }
    try {
      if (activity) {
        const { kind: _kind, ...fields } = parsed.data as CreateLibraryActivityRequest;
        await update.mutateAsync(fields);
      } else {
        await create.mutateAsync(parsed.data);
      }
      toast.success({ title: publish ? "Published" : "Saved" });
      router.push(basePath);
    } catch {
      // The mutation's onError told them why.
    }
  };

  const name = KIND_NAMES[kind];
  return (
    <FormPageShell
      actions={
        <>
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void save(false)}>
            {activity?.status === "PUBLISHED" ? "Save" : "Save draft"}
          </Button>
          {activity?.status !== "PUBLISHED" ? (
            <Button type="button" size="sm" disabled={saving} onClick={() => void save(true)}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Publish
            </Button>
          ) : null}
        </>
      }
      backHref={basePath}
      backLabel="Back to the library"
      description={
        kind === "MCQ"
          ? "Prepare the question and its answer key here. A coach only shares it with the class."
          : "A goal-based game against the computer. Set it up here; a coach only shares it with the class."
      }
      eyebrow="Puzzle library"
      title={activity ? `Edit ${name}` : `New ${name}`}
    >
      <Card className="p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="ac-title" label="Title">
            <Input id="ac-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <FormField id="ac-folder" label="Folder">
            <Select id="ac-folder" value={topicId} placeholder="Choose a folder" options={folderOptions} onChange={(e) => setTopicId(e.target.value)} />
          </FormField>
          <FormField id="ac-difficulty" label="Difficulty">
            <Select id="ac-difficulty" value={difficulty} options={PUZZLE_DIFFICULTY_OPTIONS} onChange={(e) => setDifficulty(e.target.value as PuzzleDifficulty)} />
          </FormField>
          <FormField id="ac-topic" label="Topic (optional)">
            <Input id="ac-topic" maxLength={80} value={topic} placeholder="Endgames" onChange={(e) => setTopic(e.target.value)} />
          </FormField>
          <FormField id="ac-tags" label="Tags (comma separated)">
            <Input id="ac-tags" value={tagsText} placeholder="mate, rook" onChange={(e) => setTagsText(e.target.value)} />
          </FormField>
        </div>
        <div className="mt-3">
          <FormField id="ac-description" label="Description (optional)">
            <Textarea id="ac-description" rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        {kind === "MCQ" ? (
          <McqEditor config={mcq} onChange={setMcq} />
        ) : (
          <PlayoutEditor config={playout} onChange={setPlayout} onTemplate={(t) => setTitle((current) => current || t)} />
        )}
      </Card>
    </FormPageShell>
  );
}
