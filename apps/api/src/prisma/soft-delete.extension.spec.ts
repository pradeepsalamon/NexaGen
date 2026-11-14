import { getTrashEntity, getTrashEntityByDelegate, softDeleteModels, trashEntities } from "./soft-delete.extension";

describe("soft-delete.extension", () => {
  describe("getTrashEntity", () => {
    it("should return the correct trash entity by label regardless of case", () => {
      const userEntity = getTrashEntity("User");
      expect(userEntity).toBeDefined();
      expect(userEntity?.label).toBe("User");
      expect(userEntity?.delegate).toBe("user");

      const batchEntityLower = getTrashEntity("batch");
      expect(batchEntityLower).toBeDefined();
      expect(batchEntityLower?.label).toBe("Batch");
    });

    it("should return undefined for unknown entities", () => {
      const unknown = getTrashEntity("UnknownModel");
      expect(unknown).toBeUndefined();
    });
  });

  describe("getTrashEntityByDelegate", () => {
    it("should return the correct label by delegate name", () => {
      expect(getTrashEntityByDelegate("user")).toBe("User");
      expect(getTrashEntityByDelegate("studentProfile")).toBe("StudentProfile");
      expect(getTrashEntityByDelegate("batch")).toBe("Batch");
    });

    it("should return undefined for unknown delegates", () => {
      expect(getTrashEntityByDelegate("unknown")).toBeUndefined();
    });
  });

  describe("Constants definitions", () => {
    it("should have softDeleteModels defined", () => {
      expect(softDeleteModels).toContain("User");
      expect(softDeleteModels).toContain("Batch");
    });

    it("should have trashEntities defined", () => {
      expect(trashEntities.length).toBeGreaterThan(0);
      expect(trashEntities.some(e => e.label === "User")).toBe(true);
    });
  });
});
