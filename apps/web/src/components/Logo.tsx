import Image from "next/image";
import logoImage from "../nexa_logo.jpeg";

type LogoProps = {
  compact?: boolean;
  stacked?: boolean;
};

export function Logo({ compact = false, stacked = false }: LogoProps) {
  const imageWidth = stacked ? 184 : compact ? 40 : 48;
  const imageHeight = stacked ? 100 : compact ? 40 : 48;

  return (
    <div
      className={`relative z-10 flex ${stacked ? "flex-col items-center text-center" : "items-center"} gap-3`}
    >
      <Image
        alt="NexaGen Chess logo"
        className={`${stacked ? "rounded-panel object-contain p-3" : "rounded-app object-cover"} border border-app-border bg-app-surface shadow-card`}
        height={imageHeight}
        priority
        src={logoImage}
        width={imageWidth}
      />
      <div>
        <span
          className={`${stacked ? "text-2xl sm:text-3xl" : compact ? "text-sm" : "text-base"} block font-extrabold leading-tight text-app-text`}
        >
          NexaGen Chess
        </span>
        {!compact ? (
          <span className="mt-0.5 block text-xs text-app-muted">
            Learn. Practice. Master.
          </span>
        ) : null}
      </div>
    </div>
  );
}
