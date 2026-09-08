// Device presets for the responsive screenshot tool.
//
// Each entry: { w, h, dpr, mobile, touch }
//   w/h   = CSS viewport (portrait unless the name says landscape)
//   dpr   = devicePixelRatio (screenshots stay CSS-sized; only affects rendering)
//   mobile/touch = passed to the browser context (isMobile / hasTouch)
//
// `categories` groups them so you can pass `--devices mobile,tablet` etc.

export const DEVICES = {
  // ── phones (portrait) ──────────────────────────────────────
  "android-small": { w: 320, h: 568, dpr: 2, mobile: true, touch: true },
  "galaxy-s8": { w: 360, h: 740, dpr: 3, mobile: true, touch: true },
  "iphone-se": { w: 375, h: 667, dpr: 2, mobile: true, touch: true },
  "iphone-14": { w: 390, h: 844, dpr: 3, mobile: true, touch: true },
  "pixel-7": { w: 412, h: 915, dpr: 2.625, mobile: true, touch: true },
  "iphone-14-pro-max": { w: 430, h: 932, dpr: 3, mobile: true, touch: true },

  // ── phones (landscape) ─────────────────────────────────────
  "iphone-14-landscape": { w: 844, h: 390, dpr: 3, mobile: true, touch: true },
  "pixel-7-landscape": { w: 915, h: 412, dpr: 2.625, mobile: true, touch: true },

  // ── tablets (portrait) ─────────────────────────────────────
  "ipad-mini": { w: 768, h: 1024, dpr: 2, mobile: true, touch: true },
  "ipad-air": { w: 820, h: 1180, dpr: 2, mobile: true, touch: true },
  "ipad-pro-11": { w: 834, h: 1194, dpr: 2, mobile: true, touch: true },

  // ── tablets (landscape) ────────────────────────────────────
  "ipad-mini-landscape": { w: 1024, h: 768, dpr: 2, mobile: true, touch: true },
  "ipad-air-landscape": { w: 1180, h: 820, dpr: 2, mobile: true, touch: true },
  "ipad-pro-landscape": { w: 1366, h: 1024, dpr: 2, mobile: true, touch: true },

  // ── laptops ────────────────────────────────────────────────
  "laptop-hd": { w: 1366, h: 768, dpr: 1, mobile: false, touch: false },
  "laptop-13": { w: 1280, h: 800, dpr: 2, mobile: false, touch: false },
  "laptop-15": { w: 1440, h: 900, dpr: 2, mobile: false, touch: false },
  "laptop-16": { w: 1536, h: 960, dpr: 2, mobile: false, touch: false },

  // ── desktops ───────────────────────────────────────────────
  "desktop-1080": { w: 1920, h: 1080, dpr: 1, mobile: false, touch: false },
  "desktop-1440": { w: 2560, h: 1440, dpr: 1, mobile: false, touch: false },
  "desktop-ultrawide": { w: 3440, h: 1440, dpr: 1, mobile: false, touch: false },
};

export const CATEGORIES = {
  mobile: [
    "android-small",
    "galaxy-s8",
    "iphone-se",
    "iphone-14",
    "pixel-7",
    "iphone-14-pro-max",
  ],
  "mobile-landscape": ["iphone-14-landscape", "pixel-7-landscape"],
  tablet: ["ipad-mini", "ipad-air", "ipad-pro-11"],
  "tablet-landscape": [
    "ipad-mini-landscape",
    "ipad-air-landscape",
    "ipad-pro-landscape",
  ],
  laptop: ["laptop-hd", "laptop-13", "laptop-15", "laptop-16"],
  desktop: ["desktop-1080", "desktop-1440", "desktop-ultrawide"],
};

// `--devices all` → one representative per breakpoint band + the edge phones.
export const QUICK_SET = [
  "android-small",
  "iphone-14",
  "iphone-14-pro-max",
  "iphone-14-landscape",
  "ipad-mini",
  "ipad-air-landscape",
  "laptop-13",
  "laptop-15",
  "desktop-1080",
];

/**
 * Resolve a comma-separated `--devices` value into an ordered, de-duped list of
 * device keys. Accepts device keys, category names, "all", and "quick".
 */
export function resolveDevices(spec) {
  if (!spec || spec === "quick") return QUICK_SET;
  if (spec === "all") return Object.keys(DEVICES);

  const out = [];
  for (const raw of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (raw === "all") return Object.keys(DEVICES);
    if (raw === "quick") {
      QUICK_SET.forEach((d) => out.includes(d) || out.push(d));
    } else if (CATEGORIES[raw]) {
      CATEGORIES[raw].forEach((d) => out.includes(d) || out.push(d));
    } else if (DEVICES[raw]) {
      out.includes(raw) || out.push(raw);
    } else {
      throw new Error(
        `Unknown device / category "${raw}". Known devices: ${Object.keys(DEVICES).join(", ")}. ` +
          `Categories: ${Object.keys(CATEGORIES).join(", ")}, all, quick.`,
      );
    }
  }
  return out;
}
