"use client";

import { useState } from "react";
import { TRANSCRIPT_RETENTION_DAYS } from "@nexa-chess/types";
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
import { useToast } from "@/providers/ToastProvider";
import { useSetTranscriptConsent } from "../hooks/useTranscriptApi";

/**
 * The coach's consent to having their class speech turned into text. The
 * wording is versioned (`TRANSCRIPT_CONSENT_VERSION`): change what it says
 * and bump the version, so coaches are asked again.
 */
export function TranscriptConsentDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [ticked, setTicked] = useState(false);
  const setConsent = useSetTranscriptConsent();
  const toast = useToast();

  const agree = async () => {
    try {
      await setConsent.mutateAsync(true);
      setTicked(false);
      onOpenChange(false);
    } catch (error) {
      toast.error({
        message: error instanceof Error ? error.message : undefined,
        title: "Couldn't save your consent",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keep a transcript of your speech?</DialogTitle>
          <DialogDescription>
            This class is set to keep what you say as text. It only starts if you agree.
          </DialogDescription>
        </DialogHeader>

        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-app-text">
          <li>
            <strong>Only you are transcribed.</strong> Your browser listens to your own microphone while it is
            unmuted. Students&apos; microphones are never transcribed, though a voice your microphone picks up in the
            room may appear.
          </li>
          <li>
            <strong>Your audio goes to Google.</strong> Chrome sends your microphone audio to Google&apos;s speech
            service to turn it into text. We receive and store only the text, never the audio.
          </li>
          <li>
            <strong>Kept for {TRANSCRIPT_RETENTION_DAYS} days.</strong> You and the academy&apos;s admins can read it
            after the class, and it may be used to prepare a class summary. Students cannot see it.
          </li>
          <li>
            <strong>You stay in control.</strong> Pause it or withdraw your consent at any time in Settings → Class
            transcript. Muting your microphone also pauses it.
          </li>
        </ul>

        <Checkbox
          checked={ticked}
          id="transcript-consent"
          label="I agree to my speech in live classes being transcribed as described."
          onCheckedChange={(value) => setTicked(value === true)}
        />

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button type="button" disabled={!ticked} isLoading={setConsent.isPending} onClick={() => void agree()}>
            Agree and start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
