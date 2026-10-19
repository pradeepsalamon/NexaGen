import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { AI_CONTRACT_SCHEMAS } from "@nexa-chess/types";

// The same fixtures run through Pydantic and jsonschema in
// services/ai-runtime/tests/test_contract.py; every verdict must agree.
const FIXTURES = resolve(__dirname, "../../../../services/ai-runtime/contract/v1/fixtures");

interface Fixture {
  data: unknown;
  reason: string;
  valid: boolean;
}

const schemaNames = Object.keys(AI_CONTRACT_SCHEMAS) as (keyof typeof AI_CONTRACT_SCHEMAS)[];

describe("AI runtime contract fixtures (Zod)", () => {
  it("has fixtures for every exported schema and no others", () => {
    expect(readdirSync(FIXTURES).sort()).toEqual([...schemaNames].sort());
  });

  for (const name of schemaNames) {
    const dir = join(FIXTURES, name);
    const files = readdirSync(dir).filter((file) => file.endsWith(".json")).sort();

    it(`${name} has at least one valid and one invalid case`, () => {
      const verdicts = files.map((file) => (JSON.parse(readFileSync(join(dir, file), "utf8")) as Fixture).valid);
      expect(verdicts).toContain(true);
      expect(verdicts).toContain(false);
    });

    for (const file of files) {
      const fixture = JSON.parse(readFileSync(join(dir, file), "utf8")) as Fixture;
      it(`${name}/${file}: ${fixture.reason}`, () => {
        expect(AI_CONTRACT_SCHEMAS[name].schema.safeParse(fixture.data).success).toBe(fixture.valid);
      });
    }
  }
});
