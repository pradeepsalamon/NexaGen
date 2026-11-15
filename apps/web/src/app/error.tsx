"use client";

import { ErrorScreen, type ErrorScreenProps } from "@/components/common/ErrorScreen";

// Any page without a closer error.tsx. The header stays; global-error.tsx covers the root layout itself.
export default function RootError(props: Omit<ErrorScreenProps, "variant">) {
  return <ErrorScreen {...props} variant="page" />;
}
