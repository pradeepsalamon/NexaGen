import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import type { PrismaService } from "../prisma/prisma.service";
import { AcademyLinksService } from "./academy-links.service";
import { runInTenant } from "./tenant-context";

const NEXA = getFrontendUrl(getApiEnv()).replace(/\/+$/, "");
const SCHEME = NEXA.startsWith("http://") ? "http" : "https";

function build(hostname: string | null) {
  const findFirst = jest.fn().mockResolvedValue(hostname ? { hostname } : null);
  const prisma = { tenantDomain: { findFirst } } as unknown as PrismaService;
  return { findFirst, links: new AcademyLinksService(prisma) };
}

describe("AcademyLinksService", () => {
  it("gives Nexa and platform work Nexa's own address without a lookup", async () => {
    const { findFirst, links } = build("chess.example.com");
    await expect(links.origin(DEFAULT_TENANT_ID)).resolves.toBe(NEXA);
    await expect(links.origin(null)).resolves.toBe(NEXA);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("gives another academy its primary active domain, cached", async () => {
    const { findFirst, links } = build("chess.example.com");
    await expect(links.origin("tenant-b")).resolves.toBe(`${SCHEME}://chess.example.com`);
    await expect(links.origin("tenant-b")).resolves.toBe(`${SCHEME}://chess.example.com`);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0][0].where).toEqual({ status: "ACTIVE", tenantId: "tenant-b" });
  });

  it("falls back to Nexa's address for an academy with no active domain", async () => {
    const { links } = build(null);
    await expect(links.origin("tenant-b")).resolves.toBe(NEXA);
  });

  it("reads the academy from the current context by default", async () => {
    const { links } = build("chess.example.com");
    await expect(runInTenant("tenant-b", "spec", () => links.url("/login"))).resolves.toBe(
      `${SCHEME}://chess.example.com/login`
    );
  });

  it("moves only whole Nexa links onto the academy's address", async () => {
    const { links } = build("chess.example.com");
    const out = await links.localize(
      {
        "links.class": `${NEXA}/classes/1?x=1`,
        "links.home": NEXA,
        "links.query": `${NEXA}?a=1`,
        "links.other": "https://elsewhere.test/a",
        lookalike: `${NEXA}.evil.test/a`,
        "recipient.firstName": "Asha"
      },
      "tenant-b"
    );
    expect(out).toEqual({
      "links.class": `${SCHEME}://chess.example.com/classes/1?x=1`,
      "links.home": `${SCHEME}://chess.example.com`,
      "links.query": `${SCHEME}://chess.example.com?a=1`,
      "links.other": "https://elsewhere.test/a",
      lookalike: `${NEXA}.evil.test/a`,
      "recipient.firstName": "Asha"
    });
  });

  it("returns Nexa's variables untouched", async () => {
    const { links } = build("chess.example.com");
    const variables = { "links.login": `${NEXA}/login` };
    await expect(links.localize(variables, DEFAULT_TENANT_ID)).resolves.toBe(variables);
  });
});
