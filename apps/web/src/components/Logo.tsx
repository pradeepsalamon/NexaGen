import Image from "next/image";
import type { CSSProperties } from "react";
import logoDark from "@/assets/logos/nexa_logo_dark.png";
import logoLight from "@/assets/logos/nexa_logo_light.png";
import { cn } from "@/lib/utils";

// The lockup is 480×182; the knight occupies roughly the first 0.93×height.
const LOCKUP_RATIO = 480 / 182;
const ICON_RATIO = 0.93;

type LogoProps = {
  compact?: boolean;
  stacked?: boolean;
  /** Rendered height of the lockup in px. */
  size?: number;
  /** Crop to the knight below `sm`, so the wordmark never crowds a phone header. */
  iconOnlyOnMobile?: boolean;
  /** Always use the light-on-dark lockup, for placement on a dark/brand surface in either theme. */
  onDark?: boolean;
};

export function Logo({ compact = false, stacked = false, size, iconOnlyOnMobile = false, onDark = false }: LogoProps) {
  const height = size ?? (stacked ? 96 : compact ? 32 : 40);
  const fullWidth = Math.round(height * LOCKUP_RATIO);
  const iconWidth = Math.round(height * ICON_RATIO);

  const frameStyle = {
    "--logo-full-w": `${fullWidth}px`,
    "--logo-icon-w": `${iconWidth}px`,
    height,
  } as CSSProperties;

  const imageProps = {
    className: "h-full w-auto max-w-none object-contain object-left",
    height,
    priority: true,
    style: { width: "auto" },
    width: fullWidth,
  };

  return (
    <div
      className={cn(
        "relative z-10 flex",
        stacked ? "flex-col items-center gap-3 text-center" : "items-center",
      )}
    >
      <div
        className={cn(
          "shrink-0 overflow-hidden",
          iconOnlyOnMobile ? "w-[var(--logo-icon-w)] sm:w-[var(--logo-full-w)]" : "w-[var(--logo-full-w)]",
        )}
        style={frameStyle}
      >
        {/* Both ship; the theme selector shows one (the other is display:none) with no hydration flash. */}
        {onDark ? (
          <Image {...imageProps} alt="Nexa Chess" src={logoDark} />
        ) : (
          <>
            <Image {...imageProps} alt="Nexa Chess" src={logoLight} className={cn(imageProps.className, "dark:hidden")} />
            <Image {...imageProps} alt="Nexa Chess" src={logoDark} className={cn(imageProps.className, "hidden dark:block")} />
          </>
        )}
      </div>
      {stacked && !compact ? (
        <span className="block text-sm font-medium text-app-muted">Learn. Practice. Master.</span>
      ) : null}
    </div>
  );
}
