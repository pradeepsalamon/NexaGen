import { isProfileImageUrl } from "../upload/upload.service";
import { runInTenant } from "./tenant-context";
import { liveRoomName, tenantStorageRoot } from "./tenant-paths";

describe("tenant paths", () => {
  it("keeps Nexa's storage root and room names, and prefixes every other academy", () => {
    expect(tenantStorageRoot("tenant_nexa")).toBe("nexa_chess");
    expect(tenantStorageRoot("tenant_acme")).toBe("tenants/tenant_acme");
    expect(liveRoomName("c1", "tenant_nexa")).toBe("class_c1");
    expect(liveRoomName("c1", "tenant_acme")).toBe("t_tenant_acme_class_c1");
  });

  it("reads the academy from the context", async () => {
    await expect(runInTenant("tenant_acme", "spec", async () => tenantStorageRoot())).resolves.toBe(
      "tenants/tenant_acme"
    );
  });

  it("accepts a profile image only from the current academy's folder", async () => {
    const nexaUrl = "https://res.cloudinary.com/demo/image/upload/v1/nexa_chess/profiles/a.png";
    const acmeUrl = "https://res.cloudinary.com/demo/image/upload/v1/tenants/tenant_acme/profiles/a.png";
    const inAcme = (url: string) => runInTenant("tenant_acme", "spec", async () => isProfileImageUrl(url, "demo"));
    const inNexa = (url: string) => runInTenant("tenant_nexa", "spec", async () => isProfileImageUrl(url, "demo"));
    await expect(inAcme(acmeUrl)).resolves.toBe(true);
    await expect(inAcme(nexaUrl)).resolves.toBe(false);
    await expect(inNexa(nexaUrl)).resolves.toBe(true);
    await expect(inNexa(acmeUrl)).resolves.toBe(false);
  });
});
