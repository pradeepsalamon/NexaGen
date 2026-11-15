"use client";

import { ErrorScreen, type ErrorScreenProps } from "@/components/common/ErrorScreen";

// Renders inside the student layout, so the nav stays and only the page is replaced.
export default function StudentError(props: Omit<ErrorScreenProps, "variant">) {
  return <ErrorScreen {...props} variant="section" />;
}
