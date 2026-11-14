"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import logoDark from "@/assets/logos/nexa_logo_dark.png";
import logoLight from "@/assets/logos/nexa_logo_light.png";
import { useTenantBrand } from "@/features/branding/context/TenantBrandProvider";
import { cn } from "@/lib/utils";

// The lockup is 480×182.
const LOCKUP_RATIO = 480 / 182;

type LogoProps = {
  compact?: boolean;
  stacked?: boolean;
  /** Rendered height of the lockup in px. */
  size?: number;
  /**
   * Height below `sm`. The full lockup always shows (never cropped to the
   * knight); a phone header gets it smaller instead, inside the same header height.
   */
  mobileSize?: number;
  /** Always use the light-on-dark lockup, for placement on a dark/brand surface in either theme. */
  onDark?: boolean;
};

/**
 * An academy's own logo (or its name) on its own address (docs/SAAS_MULTI_TENANCY.md §F).
 * Width-capped: a long name or a wide upload must not push the header's menu off a phone.
 */
function AcademyLogo({ height, onDark }: { height: number; onDark: boolean }) {
  // Height comes from the frame's `--logo-h` / `--logo-h-sm` (see `Logo`).
  const heightClass = "h-[var(--logo-h-sm)] sm:h-[var(--logo-h)]";
  const { config, name } = useTenantBrand();
  const light = config?.logoLightUrl ?? config?.logoDarkUrl ?? null;
  const dark = config?.logoDarkUrl ?? config?.logoLightUrl ?? null;
  if (!light && !dark) {
    return name ? (
      <span className="academy-brand-only max-w-[40vw] truncate font-display text-lg font-extrabold leading-none sm:max-w-xs" style={{ lineHeight: `${height}px` }}>
        {name}
      </span>
    ) : (
      <span aria-hidden="true" className="academy-brand-only" style={{ height }} />
    );
  }
  // Remote images the academy uploaded (Cloudinary); next/image would need every host allow-listed.
  /* eslint-disable @next/next/no-img-element */
  return onDark ? (
    <img alt={name} className={cn("academy-brand-only w-auto max-w-[40vw] object-contain sm:max-w-xs", heightClass)} src={dark ?? light ?? ""} />
  ) : (
    <>
      <img alt={name} className={cn("academy-brand-only w-auto max-w-[40vw] object-contain sm:max-w-xs dark:hidden", heightClass)} src={light ?? ""} />
      <img alt={name} className={cn("academy-brand-only hidden w-auto max-w-[40vw] object-contain sm:max-w-xs dark:block", heightClass)} src={dark ?? ""} />
    </>
  );
  /* eslint-enable @next/next/no-img-element */
}

export function Logo({ compact = false, stacked = false, size, mobileSize, onDark = false }: LogoProps) {
  const height = size ?? (stacked ? 96 : compact ? 32 : 40);
  const mobileHeight = Math.min(mobileSize ?? height, height);
  const fullWidth = Math.ceil(height * LOCKUP_RATIO);

  // Below `sm` the whole lockup scales down to `mobileHeight`; it is never cropped.
  const sizeVars = {
    "--logo-h": `${height}px`,
    "--logo-h-sm": `${mobileHeight}px`,
    "--logo-w": `${fullWidth}px`,
    "--logo-w-sm": `${Math.ceil(mobileHeight * LOCKUP_RATIO)}px`,
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
      style={sizeVars}
    >
      <AcademyLogo height={height} onDark={onDark} />
      <div
        className={cn(
          "platform-brand-only shrink-0",
          "h-[var(--logo-h-sm)] w-[var(--logo-w-sm)] sm:h-[var(--logo-h)] sm:w-[var(--logo-w)]",
        )}
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
        <span className="platform-brand-only block text-sm font-medium text-app-muted">Learn. Practice. Master.</span>
      ) : null}
    </div>
  );
}
