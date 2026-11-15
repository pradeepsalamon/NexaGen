"use client";

import { ErrorScreen, type ErrorScreenProps } from "@/components/common/ErrorScreen";

// Renders inside the coach layout, so the nav stays and only the page is replaced.
export default function CoachError(props: Omit<ErrorScreenProps, "variant">) {
  return <ErrorScreen {...props} variant="section" />;
}
