// Canvas helpers shared by the Interactives that export an image or a video.
// Canvas can't read Tailwind classes, so colours come from the theme's CSS
// variables at draw time — the export matches the brand in either theme.

export function themeColor(name: string): string {
  if (typeof window === "undefined") return "transparent";
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!value) return "transparent";
  // `--rgb-*` tokens are bare "r g b" triples.
  return /^\d+\s+\d+\s+\d+$/.test(value) ? `rgb(${value})` : value;
}

export function brandColors() {
  return {
    accent: themeColor("--rgb-success"),
    border: themeColor("--rgb-border"),
    muted: themeColor("--rgb-text-muted"),
    /** Text on a `primary` fill: white in light, navy in dark (primary is pale there). */
    onPrimary: themeColor("--rgb-on-primary"),
    primary: themeColor("--rgb-primary"),
    secondary: themeColor("--rgb-accent"),
    soft: themeColor("--rgb-surface-soft"),
    surface: themeColor("--rgb-surface"),
    text: themeColor("--rgb-text"),
  };
}

export function bodyFont(weight: number, px: number): string {
  const family =
    typeof window === "undefined"
      ? "sans-serif"
      : getComputedStyle(document.body).fontFamily || "sans-serif";
  return `${weight} ${px}px ${family}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "nexa"
  );
}

/** Wraps `text` to `maxWidth`, returning the lines (at most `maxLines`, last one ellipsised). */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  // A word wider than the whole line is cut to fit rather than overflowing.
  const fitWithEllipsis = (str: string): string => {
    let low = 1;
    let high = str.length;
    let best = str.slice(0, 1);
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = `${str.slice(0, mid)}…`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        best = str.slice(0, mid);
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return `${best}…`;
  };

  const fit = (word: string) => {
    if (ctx.measureText(word).width <= maxWidth) return word;
    return fitWithEllipsis(word);
  };
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = fit(word);
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fitWithEllipsis(kept[maxLines - 1]);
    return kept;
  }
  return lines;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Prints one image through a hidden iframe (no pop-up for a blocker to stop). */
export function printImage(dataUrl: string, title: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(
    `<!doctype html><title>${title.replace(/</g, "&lt;")}</title>` +
      `<style>@page{margin:12mm}html,body{margin:0}img{width:100%;height:auto}</style>` +
      `<img alt="" src="${dataUrl}">`,
  );
  doc.close();
  const img = doc.querySelector("img");
  const go = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1000);
  };
  if (img && !img.complete) img.onload = go;
  else go();
}
