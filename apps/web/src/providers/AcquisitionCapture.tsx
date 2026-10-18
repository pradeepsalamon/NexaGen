"use client";

import { useEffect } from "react";
import { captureAcquisitionFromUrl } from "@/lib/acquisition";

/**
 * Runs the first-touch acquisition capture once per app load. Renders nothing.
 */
export function AcquisitionCapture() {
  useEffect(() => {
    captureAcquisitionFromUrl();
  }, []);
  return null;
}
