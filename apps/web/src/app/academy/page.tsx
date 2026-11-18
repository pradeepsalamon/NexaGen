import type { Metadata } from "next";
import { AcademyHomeV1 } from "@/features/academy/components/AcademyHomeV1";
import { ACADEMY_NAME } from "@/features/academy/content";

/**
 * The original academy home page, kept for reference after the Design System v2
 * page took over `/` (owner, 2026-11-16). Same content and form, so it is not
 * indexed and points search engines at `/`; the JSON-LD stays on `/` only.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  description:
    "Live online chess classes with FIDE-rated coaches: beginner to advanced, 1-on-1, buddy or group, plus Sunday tournament training. Book a free demo class.",
  robots: { follow: true, index: false },
  title: { absolute: `Online Chess Classes for Kids & Adults | ${ACADEMY_NAME}` }
};

export default function AcademyPage() {
  return <AcademyHomeV1 />;
}
