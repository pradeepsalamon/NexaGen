import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Shared look for the 1200×630 link-preview images (WhatsApp, LinkedIn, X,
// Facebook, Slack…). Rendered once at build time from the brand logo.
export const OG_SIZE = { height: 630, width: 1200 };
export const OG_CONTENT_TYPE = "image/png";

const INK = "#0f1f2f";
const GOLD = "#d4a843";

export async function renderOgImage({ title, subtitle }: { title: string; subtitle: string }) {
  const logo = await readFile(join(process.cwd(), "public/academy/nexa_logo_light1.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #f8f5ec 0%, #ffffff 55%, #f3ead2 100%)",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          padding: "64px 72px",
          width: "100%"
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img> */}
        <img alt="" height={152} src={logoSrc} width={400} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: INK, fontSize: 68, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05 }}>{title}</div>
          <div style={{ color: "#3a5068", fontSize: 32, lineHeight: 1.35, marginTop: 20 }}>{subtitle}</div>
        </div>
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
          <div style={{ background: GOLD, borderRadius: 999, color: INK, display: "flex", fontSize: 28, fontWeight: 700, padding: "12px 28px" }}>
            Book a free demo class
          </div>
          <div style={{ color: INK, fontSize: 30, fontWeight: 700 }}>nexachess.in</div>
        </div>
      </div>
    ),
    OG_SIZE
  );
}
