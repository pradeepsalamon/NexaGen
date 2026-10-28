"use client";

import { useEffect, useMemo, useState } from "react";
import type { PendingFeedbackItem } from "@nexa-chess/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from "@/components/ui/Dialog";
import { useTheme } from "@/providers/ThemeProvider";
import { usePendingFeedbackQuery } from "../hooks/useFeedbackApi";
import { FeedbackItemCard, FeedbackItemHeading } from "./FeedbackItemCard";
import { FeedbackQuestionnaire } from "./FeedbackQuestionnaire";

const DISMISSED_KEY = "nexa-feedback-popup-dismissed";

const itemKey = (item: PendingFeedbackItem) =>
  `${item.formId}|${item.coachId}|${item.contextKey}`;

function readDismissed(): string[] {
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeDismissed(keys: string[]) {
  try {
    window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(keys));
  } catch {
    // Storage blocked — the pop-up will just come back next visit.
  }
}

export function DashboardFeedback() {
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";
  const { data } = usePendingFeedbackQuery();
  const [dismissed, setDismissed] = useState<string[] | null>(null);
  const [popupKey, setPopupKey] = useState<string | null>(null);
  const [popupDone, setPopupDone] = useState(false);

  useEffect(() => setDismissed(readDismissed()), []);

  const items = useMemo(() => data?.items ?? [], [data]);

  useEffect(() => {
    if (popupDone || popupKey || dismissed === null) return;
    const first = items.find(
      (item) =>
        item.placements.includes("DASHBOARD_POPUP") &&
        !dismissed.includes(itemKey(item))
    );
    if (first) setPopupKey(itemKey(first));
  }, [dismissed, items, popupDone, popupKey]);

  const popupItem = popupKey
    ? items.find((item) => itemKey(item) === popupKey)
    : undefined;
  const cardItems = items.filter(
    (item) =>
      item.placements.includes("DASHBOARD_CARD") && itemKey(item) !== popupKey
  );
  const cardItem = cardItems[0];

  const closePopup = () => {
    setPopupKey(null);
    setPopupDone(true);
  };

  const dismiss = (item: PendingFeedbackItem) => {
    const next = [...(dismissed ?? []), itemKey(item)];
    setDismissed(next);
    writeDismissed(next);
    closePopup();
  };

  return (
    <>
      {cardItem ? (
        <div className="grid gap-2">
          <FeedbackItemCard item={cardItem} key={itemKey(cardItem)} />
          {cardItems.length > 1 ? (
            <p
              className={`px-1 text-xs font-medium ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
                }`}
            >
              {cardItems.length - 1} more feedback request
              {cardItems.length > 2 ? "s" : ""} after this one
            </p>
          ) : null}
        </div>
      ) : null}

      <Dialog
        onOpenChange={(open) => {
          if (!open && popupItem) dismiss(popupItem);
        }}
        open={Boolean(popupItem)}
      >
        {popupItem ? (
          <DialogContent
            className={`max-h-[90dvh] overflow-y-auto sm:max-w-lg rounded-2xl border p-6 ${isDark
                ? "bg-[#07142B] border-white/12 text-white"
                : "bg-white border-[#E8EDF5] text-[#071B41]"
              }`}
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <DialogDescription className="sr-only">
              Feedback about {popupItem.coachName}
            </DialogDescription>
            <div className="grid gap-5">
              <FeedbackItemHeading
                item={popupItem}
                renderTitle={(className, text) => (
                  <DialogTitle className={className}>{text}</DialogTitle>
                )}
              />
              <FeedbackQuestionnaire
                compact
                item={popupItem}
                key={itemKey(popupItem)}
                onDone={closePopup}
              />
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}