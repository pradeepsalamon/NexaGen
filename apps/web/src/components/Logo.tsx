import Image from "next/image";
import logoImage from "@/assets/logos/nexa_logo.png";

type LogoProps = {
  compact?: boolean;
  stacked?: boolean;
  size?: number;
};

export function Logo({ compact = false, stacked = false, size }: LogoProps) {
  const imageWidth = size ?? (stacked ? 64 : compact ? 32 : 40);
  const imageHeight = size ?? (stacked ? 64 : compact ? 32 : 40);

  return (
    <div
      className={`relative z-10 flex ${stacked ? "flex-col items-center text-center gap-4" : "items-center gap-3"}`}
    >
      <Image
        alt="Nexa Chess logo"
        className="object-contain"
        height={imageHeight}
        priority
        src={logoImage}
        width={imageWidth}
      />
      <div>
        <span
          className={`${stacked ? "text-2xl sm:text-3xl tracking-tight" : compact ? "text-sm" : "text-base"} block font-extrabold leading-tight text-app-text`}
        >
          Nexa Chess
        </span>
        {!compact ? (
          <span className="mt-1 block text-sm font-medium text-app-muted">
            Learn. Practice. Master.
          </span>
        ) : null}
      </div>
    </div>
  );
}
