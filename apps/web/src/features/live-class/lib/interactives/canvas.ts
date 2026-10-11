// Canvas helpers shared by the Interactives that export an image or a video.
// Canvas can't read Tailwind classes, so colours come from the theme's CSS
// variables at draw time — the export matches the brand in either theme.

export function themeColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!value) return fallback;
  // `--rgb-*` tokens are bare "r g b" triples.
  return /^\d+\s+\d+\s+\d+$/.test(value) ? `rgb(${value})` : value;
}

export function brandColors() {
  return {
    accent: themeColor("--rgb-accent", "rgb(31 157 120)"),
    border: themeColor("--rgb-border", "rgb(221 225 240)"),
    muted: themeColor("--rgb-text-muted", "rgb(94 103 132)"),
    primary: themeColor("--rgb-primary", "rgb(36 71 160)"),
    secondary: themeColor("--rgb-secondary", "rgb(244 182 63)"),
    soft: themeColor("--rgb-surface-soft", "rgb(238 241 250)"),
    surface: themeColor("--rgb-surface", "rgb(255 255 255)"),
    text: themeColor("--rgb-text", "rgb(23 32 73)"),
    warm: themeColor("--rgb-warm", "rgb(224 104 90)"),
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
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth)
      last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
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
