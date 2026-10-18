"use client";

import { useEffect } from "react";
import { useResolvedTypographyQuery } from "../hooks/useTypographyApi";
import { applyTypography } from "../lib/applyTypography";

/** Keeps the document's fonts + text size in step with the caller's resolved typography. */
export function TypographySync() {
  const { data } = useResolvedTypographyQuery();

  useEffect(() => {
    if (data) applyTypography(data.config);
  }, [data]);

  return null;
}
