import Image from "next/image";
import { ArrowRight, Handshake, type LucideIcon, User, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ACADEMY_CLASS_FORMATS } from "../content";
import { CheckItem, Section, SectionHeader } from "./parts";

// Names come from content.ts (also published in llms.txt) and the bullets restate
// its descriptions, so the page makes no claim the structured data doesn't.
const [individualFormat, buddyFormat, groupFormat] = ACADEMY_CLASS_FORMATS;


const learningOptions: {
  features: string[];
  highlight: boolean;
  Icon: LucideIcon;
  pieceImage: string;
  subtitle: string;
  title: string;
}[] = [
  {
    features: ["One-on-one coaching", "Personalised attention", "Flexible timing", "A custom curriculum"],
    highlight: false,
    Icon: User,
    pieceImage: "/class/01_gold_king.webp",
    subtitle: "One-on-one coaching.",
    title: individualFormat.name
  },
  {
    features: ["Learn together with friends", "Interactive and fun", "A friendly competitive setting"],
    highlight: true,
    Icon: Handshake,
    pieceImage: "/class/02_black_gold_pawn.webp",
    subtitle: "Learn together with friends.",
    title: buddyFormat.name
  },
  {
    features: ["Collaborative coaching", "Affordable", "Team activities"],
    highlight: false,
    Icon: Users,
    pieceImage: "/class/03_black_gold_rook.webp",
    subtitle: "Coaching in a group.",
    title: groupFormat.name
  }
];

export function ClassTypesSection() {
  return (
    <Section
      id="class-types"
      labelledBy="class-types-heading"
      tone="surface"
    >
      <SectionHeader
        description="Choose a format tailored to your schedule, learning pace, and competitive goals."
        eyebrow="Learning formats"
        id="class-types-heading"
        title="Flexible learning options"
      />

      <ul className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
        {learningOptions.map(({ features, highlight, Icon, pieceImage, subtitle, title }) => (
          <li
            className={cn(
              "group flex flex-col gap-5 overflow-hidden rounded-panel border bg-app-background p-3 shadow-card transition-shadow hover:shadow-lg",
              highlight ? "border-primary ring-1 ring-primary" : "border-app-border"
            )}
            key={title}
          >
            <div aria-hidden="true" className="relative aspect-[16/10] overflow-hidden rounded-control bg-app-soft">
              <Image
                alt=""
                className="object-cover object-[center_55%] transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
                fill
                sizes="(min-width: 768px) 33vw, 100vw"
                src={pieceImage}
              />
              <span className="absolute bottom-3 left-3 flex size-10 items-center justify-center rounded-control bg-app-surface text-primary-ink shadow-card">
                <Icon className="size-5" strokeWidth={2.25} />
              </span>
            </div>
            <div className="grid gap-1 px-3">
              <h3 className="text-xl font-bold text-app-text">{title}</h3>
              <p className="text-sm text-app-muted">{subtitle}</p>
            </div>
            <ul className="grid flex-1 content-start gap-2.5 px-3">
              {features.map((feature) => (
                <CheckItem key={feature}>{feature}</CheckItem>
              ))}
            </ul>
            <div className="px-3 pb-3"><Button asChild fullWidth variant={highlight ? "primary" : "neutral"}>
              <a aria-label={`${title}: book a free demo class`} href="#demo">
                Learn more
                <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.25} />
              </a>
            </Button></div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
