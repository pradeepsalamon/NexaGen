import { API_ROUTES, type PlatformTenantResponse, type TenantBrandingResponse, type TenantPublicConfig } from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { hashSecret } from "../auth/auth.utils";
import { createTestApp, type TestApp } from "../test/integration/app";
import { TEST_ORIGIN } from "../test/integration/app-env";
import { createUser, resetDatabase } from "../test/integration/db";
import { asPlatform, runInTenant } from "../tenancy/tenant-context";
import { SystemMessageRenderer } from "../mail/system-message-renderer.service";
import { BrandingService } from "./branding.service";
import { EntitlementService } from "../platform/entitlement.service";

// Phase 5 (docs/SAAS_MULTI_TENANCY.md §E cookies, §F branding, §H domains).
describe("academy branding, domains and host-only cookies (real app, real Postgres)", () => {
  let t: TestApp;
  let operator: Awaited<ReturnType<typeof createUser>>;
  let owner: Awaited<ReturnType<typeof createUser>>;
  let tenantId: string;
  const ACADEMY = "https://rook.nexachess.in";
  const password = "Branding@12345";
  const base = () => t.baseUrl.replace("[::1]", "127.0.0.1");

  const op = (method: string, path: string, body?: unknown) => t.call(operator, method, path, body);
  const asOwner = (method: string, path: string, body?: unknown) => t.call(owner, method, path, body, { origin: ACADEMY });
  const publicConfig = async (origin: string) =>
    (await (await fetch(`${base()}${API_ROUTES.branding.publicConfig}`, { headers: { Origin: origin } })).json()) as TenantPublicConfig;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    operator = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE },
      where: { id: (await createUser(t.prisma, UserRole.SUPER_ADMIN)).id }
    });
    const created = await op("POST", API_ROUTES.platform.tenants, {
      idempotencyKey: "branding-rook-0001",
      name: "Rook Academy",
      planCode: "GROWTH",
      slug: "rook",
      superAdmin: { email: "owner@rook.int.test", firstName: "Ravi" }
    });
    tenantId = (created.body as PlatformTenantResponse).tenant.id;
    owner = await asPlatform("spec", async () =>
      t.prisma.user.update({
        data: { password: await hashSecret(password), status: UserStatus.ACTIVE },
        where: { id: (await t.prisma.user.findFirstOrThrow({ where: { email: "owner@rook.int.test" } })).id }
      })
    );
  });

  afterAll(async () => {
    await t?.close();
  });

  it("the public config names the host's academy, Nexa's own, or nobody", async () => {
    expect(await publicConfig(ACADEMY)).toMatchObject({ isPlatformHome: false, name: "Rook Academy", poweredBy: true, tenantId });
    expect(await publicConfig(TEST_ORIGIN)).toMatchObject({ isPlatformHome: true, poweredBy: false, tenantId: "tenant_nexa" });
    expect(await publicConfig("https://unknown.example.com")).toMatchObject({ name: "", tenantId: null });
  });

  it("copy the academy sends names it: messages, system emails, PDFs (nameFor)", async () => {
    const branding = t.app.get(BrandingService);
    expect(await runInTenant(tenantId, "spec", () => branding.nameFor())).toBe("Rook Academy");
    expect(await runInTenant("tenant_nexa", "spec", () => branding.nameFor())).toBe("Nexa Chess");
    expect(await branding.nameFor(null)).toBe("Nexa Chess");
    const reset = await runInTenant(tenantId, "spec", () =>
      t.app.get(SystemMessageRenderer).render("PASSWORD_RESET", { "links.reset": "https://rook.nexachess.in/reset" })
    );
    expect(reset.subject).toContain("Rook Academy");
    expect(reset.subject).not.toContain("Nexa");
  });

  it("admins set the look; a colour white text can't read on is refused", async () => {
    const tooLight = await asOwner("PUT", API_ROUTES.branding.admin, { primaryColor: "#FFE14D" });
    expect(tooLight.status).toBe(400);
    const saved = await asOwner("PUT", API_ROUTES.branding.admin, {
      displayName: "Rook Chess School",
      primaryColor: "#1e3a8a",
      tagline: "Think two moves ahead"
    });
    expect(saved.status).toBe(200);
    expect((saved.body as TenantBrandingResponse).branding.primaryColor).toBe("#1E3A8A");
    const config = await publicConfig(ACADEMY);
    expect(config.name).toBe("Rook Chess School");
    expect(config.palette?.light["--rgb-primary"]).toBe("30 58 138");
    expect(config.palette?.dark["--rgb-primary"]).toBeDefined();
  });

  it("a renamed non-image is refused before anything is stored", async () => {
    const form = new FormData();
    form.append("file", new Blob(["not an image"], { type: "image/png" }), "logo.png");
    const token = await t.tokenFor(owner);
    const res = await fetch(`${base()}${API_ROUTES.branding.asset("logoLight")}`, {
      body: form,
      headers: { Cookie: `nexa_h_access_token=${token}`, Origin: ACADEMY },
      method: "POST"
    });
    expect(res.status).toBe(400);
  });

  it("white label and own domains are plan features", async () => {
    expect((await asOwner("PUT", API_ROUTES.branding.whiteLabel, { hidePoweredBy: true })).status).toBe(402);
    expect((await asOwner("GET", API_ROUTES.branding.domains)).status).toBe(402);
    expect((await op("POST", API_ROUTES.platform.tenantDomains(tenantId), { hostname: "learn.rook.example" })).status).toBe(402);

    await op("POST", API_ROUTES.platform.tenantPlan(tenantId), { planCode: "ENTERPRISE", when: "now" });
    t.app.get(EntitlementService).invalidate();
    const added = await op("POST", API_ROUTES.platform.tenantDomains(tenantId), { hostname: "learn.rook.example" });
    expect(added.status).toBe(201);
    expect((await asOwner("GET", API_ROUTES.branding.domains)).body).toMatchObject({ dnsTarget: "rook.nexachess.in" });
    // On Enterprise, "Powered by" is hidden by default and can be shown again.
    t.app.get(EntitlementService).invalidate();
    await asOwner("PUT", API_ROUTES.branding.admin, { tagline: "Refresh" });
    expect((await publicConfig(ACADEMY)).poweredBy).toBe(false);
    await asOwner("PUT", API_ROUTES.branding.whiteLabel, { hidePoweredBy: false });
    expect((await publicConfig(ACADEMY)).poweredBy).toBe(true);
  });

  it("an academy connects its own WhatsApp number; Nexa keeps the server's", async () => {
    const view = await asOwner("GET", API_ROUTES.branding.whatsapp);
    expect(view.body).toMatchObject({ configured: false, usesPlatformNumber: false });
    expect((await asOwner("PUT", API_ROUTES.branding.whatsapp, { enabled: true, phoneNumberId: "123456789" })).status).toBe(400);
    const saved = await asOwner("PUT", API_ROUTES.branding.whatsapp, {
      accessToken: "EAAG-academy-token",
      enabled: true,
      phoneNumberId: "123456789"
    });
    expect(saved.body).toMatchObject({ configured: true, hasAccessToken: true, phoneNumberId: "123456789" });
    expect(JSON.stringify(saved.body)).not.toContain("EAAG");
    const row = await asPlatform("spec", () => t.prisma.whatsAppSettings.findUniqueOrThrow({ where: { tenantId } }));
    expect(row.accessTokenEncrypted).not.toContain("EAAG");
    expect((await op("PUT", API_ROUTES.branding.whatsapp, { enabled: true, phoneNumberId: "1234567" })).status).toBe(400);
  });

  it("signing in on an academy's address sets host-only cookies and ignores Nexa's domain-wide ones", async () => {
    const login = await fetch(`${base()}${API_ROUTES.auth.login}`, {
      body: JSON.stringify({ email: "owner@rook.int.test", password }),
      headers: { "Content-Type": "application/json", Origin: ACADEMY },
      method: "POST"
    });
    expect(login.status).toBe(200);
    const setCookies = login.headers.getSetCookie();
    expect(setCookies.map((cookie) => cookie.split("=")[0]).sort()).toEqual(["nexa_h_access_token", "nexa_h_refresh_token"]);
    expect(setCookies.every((cookie) => !/;\s*domain=/i.test(cookie))).toBe(true);
    const hostCookie = setCookies.map((cookie) => cookie.split(";")[0]).join("; ");

    const me = (cookie: string) => fetch(`${base()}${API_ROUTES.auth.me}`, { headers: { Cookie: cookie, Origin: ACADEMY } });
    expect((await me(hostCookie)).status).toBe(200);
    // The same token under the domain-wide name is dropped on the academy's address.
    const token = hostCookie.split(";")[0].split("=")[1];
    expect((await me(`nexa_access_token=${token}`)).status).toBe(401);
  });
});
