import { createRequire } from "node:module";
import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import { renderCertificateText, type TournamentCertificateSnapshot } from "@nexa-chess/types";

const requireFromHere = createRequire(__filename);

const INK = "#14181F";
const MUTED = "#5D6672";

type PdfPrinterLike = {
  createPdfKitDocument(definition: Record<string, unknown>, options?: Record<string, unknown>): Promise<NodeJS.ReadableStream & { end(): void }>;
};

/**
 * Renders a tournament certificate (docs/TOURNAMENTS.md §3.6) from its frozen
 * snapshot with pdfmake — the same engine and fonts as invoices. Text only:
 * the template's wording, colour, border and signatories; every value is
 * plain text (placeholders are filled, never HTML).
 */
@Injectable()
export class CertificatePdfService {
  private printer: PdfPrinterLike | null = null;

  async render(snapshot: TournamentCertificateSnapshot, ids: { serialNumber: string; verificationCode: string }): Promise<Buffer> {
    const document = await this.getPrinter().createPdfKitDocument(this.definition(snapshot, ids));
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", reject);
      document.end();
    });
  }

  definition(snapshot: TournamentCertificateSnapshot, ids: { serialNumber: string; verificationCode: string }): Record<string, unknown> {
    const t = snapshot.template;
    const landscape = t.orientation === "LANDSCAPE";
    const [width, height] = landscape ? [841.89, 595.28] : [595.28, 841.89];
    const values = {
      "academy.name": snapshot.academyName,
      ageGroup: snapshot.ageGroup ?? "",
      date: snapshot.date,
      placement: snapshot.placement,
      "player.name": snapshot.playerName,
      points: snapshot.points,
      "tournament.name": snapshot.tournamentName
    };
    const verifyUrl = `${getFrontendUrl(getApiEnv())}/certificates/${ids.verificationCode}`;
    const border =
      t.borderStyle === "MINIMAL"
        ? [{ h: height - 48, lineColor: t.accentColor, lineWidth: 1, type: "rect", w: width - 48, x: 24, y: 24 }]
        : t.borderStyle === "MODERN"
          ? [
              { color: t.accentColor, h: height, type: "rect", w: 18, x: 0, y: 0 },
              { color: t.accentColor, h: 6, type: "rect", w: width, x: 0, y: height - 6 }
            ]
          : [
              { h: height - 40, lineColor: t.accentColor, lineWidth: 3, type: "rect", w: width - 40, x: 20, y: 20 },
              { h: height - 64, lineColor: t.accentColor, lineWidth: 0.75, type: "rect", w: width - 64, x: 32, y: 32 }
            ];
    const signatories = [
      [t.signatoryName, t.signatoryTitle],
      [t.secondSignatoryName, t.secondSignatoryTitle]
    ].filter(([name]) => !!name);
    return {
      background: () => ({ canvas: border }),
      content: [
        { color: MUTED, fontSize: 12, margin: [0, landscape ? 40 : 90, 0, 6], text: snapshot.academyName },
        { bold: true, color: t.accentColor, fontSize: landscape ? 34 : 30, margin: [0, 0, 0, 22], text: renderCertificateText(t.title, values) },
        { color: MUTED, fontSize: 12, margin: [0, 0, 0, 6], text: "Presented to" },
        { bold: true, color: INK, fontSize: landscape ? 30 : 26, margin: [0, 0, 0, 18], text: snapshot.playerName },
        { color: INK, fontSize: 13, lineHeight: 1.35, margin: [landscape ? 70 : 30, 0, landscape ? 70 : 30, 26], text: renderCertificateText(t.body, values) },
        { color: MUTED, fontSize: 11, margin: [0, 0, 0, 30], text: snapshot.date },
        signatories.length
          ? {
              columnGap: 40,
              columns: signatories.map(([name, title]) => ({
                stack: [
                  { canvas: [{ lineColor: MUTED, lineWidth: 0.75, type: "line", x1: 30, x2: 190, y1: 0, y2: 0 }] },
                  { bold: true, color: INK, fontSize: 11, margin: [0, 6, 0, 0], text: name ?? "" },
                  { color: MUTED, fontSize: 9, text: title ?? "" }
                ],
                width: 220
              }))
            }
          : { text: "" }
      ],
      defaultStyle: { alignment: "center", font: "Roboto" },
      footer: () => ({
        color: MUTED,
        fontSize: 8,
        margin: [40, 0, 40, 24],
        text: `Certificate ${ids.serialNumber} · verify at ${verifyUrl}`
      }),
      info: { title: `${t.title} — ${snapshot.playerName}` },
      pageMargins: [56, 56, 56, 56],
      pageOrientation: landscape ? "landscape" : "portrait",
      pageSize: "A4"
    };
  }

  private getPrinter(): PdfPrinterLike {
    if (this.printer) return this.printer;
    const PdfPrinter = requireFromHere("pdfmake/js/Printer.js").default;
    const URLResolver = requireFromHere("pdfmake/js/URLResolver.js").default;
    const virtualFsModule = requireFromHere("pdfmake/js/virtual-fs.js");
    const virtualFs = virtualFsModule.default ?? virtualFsModule;
    const fontDir = path.join(path.dirname(requireFromHere.resolve("pdfmake/package.json")), "fonts", "Roboto");
    const fonts = {
      Roboto: {
        bold: path.join(fontDir, "Roboto-Medium.ttf"),
        bolditalics: path.join(fontDir, "Roboto-MediumItalic.ttf"),
        italics: path.join(fontDir, "Roboto-Italic.ttf"),
        normal: path.join(fontDir, "Roboto-Regular.ttf")
      }
    };
    // Nothing in a certificate references a URL or a path: only our own TTFs are read.
    this.printer = new PdfPrinter(fonts, virtualFs, new URLResolver(virtualFs), () => true) as PdfPrinterLike;
    return this.printer;
  }
}
