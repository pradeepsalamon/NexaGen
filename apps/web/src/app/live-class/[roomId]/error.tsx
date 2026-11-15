"use client";

import { ErrorScreen, type ErrorScreenProps } from "@/components/common/ErrorScreen";

// Inside the room layout; a full reload is the clean way back into LiveKit.
export default function LiveClassError(props: Omit<ErrorScreenProps, "variant">) {
  return <ErrorScreen {...props} variant="classroom" />;
}
