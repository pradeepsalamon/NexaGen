"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { brandPaletteCss, type TenantPublicConfig } from "@nexa-chess/types";
import { SITE_NAME } from "@/lib/site";
import { getTenantPublicConfig } from "../api/brandingApi";

/** localStorage: the last academy look, applied by the root layout's init script before first paint. */
export const BRAND_STORAGE_KEY = "nexa-brand";

type TenantBrand = {
  /** This page is on another academy's own address (set before paint by the root layout). */
  isAcademyHost: boolean;
  /** That academy's public config, once loaded; null on Nexa's own hosts. */
  config: TenantPublicConfig | null;
  /** The name to show: the academy's, or "Nexa Chess". Empty while an academy's config loads. */
  name: string;
};

const TenantBrandContext = createContext<TenantBrand>({ config: null, isAcademyHost: false, name: SITE_NAME });

export const useTenantBrand = () => useContext(TenantBrandContext);

/** The brand name for copy ("Welcome back to …"). */
export const useBrandName = () => useTenantBrand().name || SITE_NAME;

function setFavicon(href: string) {
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')) link.remove();
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = href;
  document.head.appendChild(link);
}

/** Pages title themselves "X | Nexa Chess"; on an academy's address the brand part becomes its name. */
function watchTitle(name: string) {
  // A name that is or contains "Nexa Chess" would rewrite forever: the
  // observer fires on every write, so only ever write a changed title.
  if (name.includes(SITE_NAME)) return undefined;
  const rewrite = () => {
    if (!document.title.includes(SITE_NAME)) return;
    const next = document.title.split(SITE_NAME).join(name);
    if (next !== document.title) document.title = next;
  };
  rewrite();
  const observer = new MutationObserver(rewrite);
  observer.observe(document.head, { characterData: true, childList: true, subtree: true });
  return () => observer.disconnect();
}

/**
 * An academy's look on its own address (docs/SAAS_MULTI_TENANCY.md §F "How
 * it renders"): palette, favicon, titles and the name/logo components read.
 * Nexa's hosts never fetch anything here, so their pages stay as they were.
 */
export function TenantBrandProvider({ children }: { children: ReactNode }) {
  const [isAcademyHost, setIsAcademyHost] = useState(false);
  useEffect(() => setIsAcademyHost(document.documentElement.dataset.host === "academy"), []);

  const query = useQuery({
    enabled: isAcademyHost,
    queryFn: getTenantPublicConfig,
    queryKey: ["tenant", "public-config"],
    staleTime: 5 * 60_000
  });
  const config = isAcademyHost ? (query.data ?? null) : null;

  useEffect(() => {
    if (!config) return;
    const css = config.palette ? brandPaletteCss(config.palette) : "";
    let style = document.getElementById("tenant-palette");
    if (!style) {
      style = document.createElement("style");
      style.id = "tenant-palette";
      document.head.appendChild(style);
    }
    style.textContent = css;
    if (config.faviconUrl) setFavicon(config.faviconUrl);
    try {
      window.localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify({ css, name: config.name }));
    } catch {
      // Private mode: the look still applies after load.
    }
    return config.name ? watchTitle(config.name) : undefined;
  }, [config]);

  const value = useMemo<TenantBrand>(
    () => ({ config, isAcademyHost, name: isAcademyHost ? (config?.name ?? "") : SITE_NAME }),
    [config, isAcademyHost]
  );
  return <TenantBrandContext.Provider value={value}>{children}</TenantBrandContext.Provider>;
}
