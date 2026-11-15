"use client";

import { ErrorScreen, type ErrorScreenProps } from "@/components/common/ErrorScreen";

// Demo guests get the same rejoin screen as a live class.
export default function DemoClassError(props: Omit<ErrorScreenProps, "variant">) {
  return <ErrorScreen {...props} variant="classroom" />;
}
