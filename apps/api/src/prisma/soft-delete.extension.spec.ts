import {
  applySoftDeleteArgs,
  getTrashEntity,
  getTrashEntityByDelegate,
  softDeleteModels,
  trashEntities
} from "./soft-delete.extension";

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

  describe("applySoftDeleteArgs", () => {
    it("filters a nested list only when it really points at a trash model", () => {
      // PuzzleTopic.puzzles is Puzzle (trashable); Assignment.puzzles is AssignmentPuzzle (no isDeleted).
      const topic = applySoftDeleteArgs("PuzzleTopic", "findMany", { include: { puzzles: true } });
      expect(topic.include.puzzles).toEqual({ where: { isDeleted: false } });

      const assignment = applySoftDeleteArgs<{ include: { puzzles: unknown }; where?: unknown }>(
        "Assignment",
        "findMany",
        { include: { puzzles: true } }
      );
      expect(assignment.where).toEqual({ isDeleted: false });
      expect(assignment.include.puzzles).toBe(true);
    });

    it("filters every list relation to a newly trashable model", () => {
      const category = applySoftDeleteArgs("KnowledgeCategory", "findMany", { include: { articles: true } });
      expect(category.include.articles).toEqual({ where: { isDeleted: false } });
    });

    it("hides deployments and student copies of a trashed assignment, keeping a findUnique key on top", () => {
      const deployment = applySoftDeleteArgs("AssignmentBatch", "findMany", { where: { batchId: "b1" } });
      expect(deployment.where).toEqual({ AND: [{ assignment: { isDeleted: false } }], batchId: "b1" });

      const copy = applySoftDeleteArgs("StudentAssignment", "findUnique", {
        where: { AND: { studentId: "s1" }, id: "sa1" }
      });
      expect(copy.where).toEqual({
        AND: [{ studentId: "s1" }, { assignmentBatch: { assignment: { isDeleted: false } } }],
        id: "sa1"
      });
    });

    it("leaves writes and includeDeleted reads alone", () => {
      const write = applySoftDeleteArgs("StudentAssignment", "update", { where: { id: "sa1" } });
      expect(write.where).toEqual({ id: "sa1" });

      const unfiltered = applySoftDeleteArgs("AssignmentBatch", "findMany", { includeDeleted: true, where: { id: "d1" } });
      expect(unfiltered).toEqual({ where: { id: "d1" } });
    });
  });
});
