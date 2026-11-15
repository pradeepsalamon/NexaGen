import Image from "next/image";
import { ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ACADEMY_PROGRAMS } from "../content";
import { CheckItem, Section, SectionHeader } from "./parts";

const programPresentation = [
  {
    featured: false,
    level: "Beginner Level",
    pieceImage: "/programs/01_gold_pawn.webp",
    subtitle: "For students starting their chess journey.",
    tag: "Foundation",
    title: "Beginner level"
  },
  {
    featured: true,
    level: "Intermediate Level",
    pieceImage: "/programs/02_gold_knight.webp",
    subtitle: "For players ready to improve their game.",
    tag: "Most popular",
    title: "Intermediate level"
  },
  {
    featured: false,
    level: "Advanced Level",
    pieceImage: "/programs/03_black_gold_king.webp",
    subtitle: "For serious competitive players.",
    tag: "Mastery",
    title: "Advanced level"
  }
];

// Topics come from content.ts, the list the JSON-LD and llms.txt publish, so the
// page never claims less (or more) than the structured data.
const programs = programPresentation.map((program) => ({
  ...program,
  features: ACADEMY_PROGRAMS.find((p) => p.level === program.level)?.topics ?? []
}));

export function ProgramsSection() {
  return (
    <Section id="programs" labelledBy="programs-heading">
      <SectionHeader
        description="Structured learning paths designed for every stage of your chess journey."
        eyebrow="Our programs"
        id="programs-heading"
        title="Choose your path"
      />

      <ul className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
        {programs.map((program) => (
          <li
            className={cn(
              "flex flex-col overflow-hidden rounded-panel border bg-app-surface shadow-card",
              program.featured ? "border-primary ring-1 ring-primary" : "border-app-border"
            )}
            key={program.level}
          >
            <div aria-hidden="true" className="relative h-44 bg-app-soft">
              <Image
                alt=""
                className="object-cover object-center"
                fill
                sizes="(min-width: 768px) 33vw, 100vw"
                src={program.pieceImage}
              />
            </div>
            <div className="flex flex-1 flex-col gap-5 p-6">
              <div className="grid gap-2">
                <Badge className="w-fit" variant={program.featured ? "accent" : "secondary"}>
                  {program.featured ? <Sparkles aria-hidden="true" className="size-3.5" strokeWidth={2.25} /> : null}
                  {program.tag}
                </Badge>
                <h3 className="text-xl font-bold text-app-text">{program.title}</h3>
                <p className="text-sm text-app-muted">{program.subtitle}</p>
              </div>
              <ul className="grid flex-1 content-start gap-2.5">
                {program.features.map((feature) => (
                  <CheckItem key={feature}>{feature}</CheckItem>
                ))}
              </ul>
              <Button asChild fullWidth variant={program.featured ? "primary" : "neutral"}>
                <a href="#demo">
                  Start learning
                  <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.25} />
                </a>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
