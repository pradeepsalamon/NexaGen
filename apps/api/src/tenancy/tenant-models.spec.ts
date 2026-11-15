import { Prisma } from "@prisma/client";
import { PLATFORM_MODELS, TENANT_MODELS } from "./tenant-models";

// The schema test from docs/SAAS_MULTI_TENANCY.md §K: an academy-owned model
// without `tenantId` would be invisible to the tenant-scope extension.
describe("tenant model classification", () => {
  const models = Prisma.dmmf.datamodel.models;

  it("gives every academy-owned model a tenantId column", () => {
    const missing = models
      .filter((model) => TENANT_MODELS.has(model.name))
      .filter((model) => !model.fields.some((field) => field.name === "tenantId" && field.kind === "scalar"))
      .map((model) => model.name);
    // Fix: add `tenantId String @default("tenant_nexa")` to the model (and a
    // migration), or list it in PLATFORM_MODELS with the reason it has no academy.
    expect(missing).toEqual([]);
  });

  it("makes that column required (D4)", () => {
    const optional = models
      .filter((model) => TENANT_MODELS.has(model.name))
      .filter((model) => model.fields.some((field) => field.name === "tenantId" && !field.isRequired))
      .map((model) => model.name);
    expect(optional).toEqual([]);
  });

  it("lists only models that exist", () => {
    const names = new Set(models.map((model) => model.name));
    expect(Object.keys(PLATFORM_MODELS).filter((name) => !names.has(name))).toEqual([]);
  });

  it("classifies every model exactly once", () => {
    expect(TENANT_MODELS.size + Object.keys(PLATFORM_MODELS).length).toBe(models.length);
  });
});
