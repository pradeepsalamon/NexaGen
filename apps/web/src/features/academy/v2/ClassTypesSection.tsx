import Image from "next/image";
import { ArrowRight, Handshake, type LucideIcon, User, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ACADEMY_CLASS_FORMATS } from "../content";
import { CheckItem, Section, SectionHeader } from "./parts";

// Names come from content.ts (also published in llms.txt) and the bullets restate
// its descriptions, so the page makes no claim the structured data doesn't.
const [individualFormat, buddyFormat, groupFormat] = ACADEMY_CLASS_FORMATS;

const SECTION_BG_LIGHT = "/programs/01_chess_reverie_light.webp";
const SECTION_BG_DARK = "/programs/02_chess_reverie_dark.webp";

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
      backdrop={{ dark: SECTION_BG_DARK, light: SECTION_BG_LIGHT }}
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
              "relative flex flex-col gap-5 overflow-hidden rounded-panel border bg-app-background p-6",
              highlight ? "border-primary ring-1 ring-primary" : "border-app-border"
            )}
            key={title}
          >
            {/* The piece sits at the card's right edge and fades into it, clear of the text. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-16 right-0 top-0 w-[32%] overflow-hidden opacity-90 [mask-image:linear-gradient(to_right,transparent,black_45%),linear-gradient(to_top,transparent,black_20%)] [mask-composite:intersect] [-webkit-mask-composite:source-in]"
            >
              <Image alt="" className="object-cover object-[58%_center]" fill sizes="(min-width: 768px) 15vw, 40vw" src={pieceImage} />
            </div>
            <span className="relative flex size-11 items-center justify-center rounded-control bg-primary-soft text-primary-ink">
              <Icon aria-hidden="true" className="size-5" strokeWidth={2.25} />
            </span>
            <div className="relative grid gap-1 pr-[33%]">
              <h3 className="text-xl font-bold text-app-text">{title}</h3>
              <p className="text-sm text-app-muted">{subtitle}</p>
            </div>
            <ul className="relative grid flex-1 content-start gap-2.5 pr-[33%]">
              {features.map((feature) => (
                <CheckItem key={feature}>{feature}</CheckItem>
              ))}
            </ul>
            <Button asChild className="relative" fullWidth variant={highlight ? "primary" : "neutral"}>
              <a aria-label={`${title}: book a free demo class`} href="#demo">
                Learn more
                <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.25} />
              </a>
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
