"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import type { SupportLinkCodeResponse } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useCreateSupportLinkCode } from "../hooks/useSupportAdmin";

/**
 * Admins: a one-time code that links a family's WhatsApp number to this student,
 * so the WhatsApp assistant can tell them the next class (docs/WHATSAPP_SUPPORT.md
 * §0 "Existing students"). Give it only to someone you know is the family.
 */
export function WhatsAppLinkCodeButton({ studentId }: { studentId: string }) {
  const timeZone = useUserTimeZone();
  const create = useCreateSupportLinkCode();
  const [result, setResult] = useState<SupportLinkCodeResponse | null>(null);

  return (
    <>
      <Button
        isLoading={create.isPending}
        onClick={() => create.mutateAsync(studentId).then(setResult, () => undefined)}
        type="button"
        variant="neutral"
      >
        <MessageCircle className="mr-1.5 size-4" strokeWidth={2.25} />
        WhatsApp link code
      </Button>
      {result ? (
        <Dialog onOpenChange={(open) => !open && setResult(null)} open>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Link code for {result.studentName}</DialogTitle>
              <DialogDescription>
                Give this to the student&apos;s family only after you&apos;ve checked who they are. They send it from their WhatsApp
                to the academy&apos;s number, and can then ask for the next class there.
              </DialogDescription>
            </DialogHeader>
            <p className="select-all rounded-control border border-app-border bg-app-soft px-4 py-3 text-center font-mono text-2xl font-bold tracking-widest text-app-text">
              LINK {result.code}
            </p>
            <p className="text-sm text-app-muted">
              Works once, until {formatDateTime(result.expiresAt, timeZone)}. It is shown only now. The WhatsApp assistant must have
              &quot;Answer linked families&quot; switched on (Support → Settings).
            </p>
            <DialogFooter>
              <Button onClick={() => setResult(null)} type="button" variant="primary">
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
