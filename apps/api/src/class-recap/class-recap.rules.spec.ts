import {
  chunkTranscript,
  classRecapContentIssues,
  cleanRecapDraft,
  containsMoveNotation,
  estimateTokens,
  parseModelJson,
  pseudonymiseTranscript,
  readRecapPoints,
  recapFinalPrompt,
  usableRecapProvider
} from "@nexa-chess/types";

// The pure class recap rules in @nexa-chess/types class-recap.ts (docs/CLASS_RECAPS.md).

describe("pseudonymiseTranscript", () => {
  const students = [
    { firstName: "Asha", lastName: "Kumar", username: "asha_k" },
    { firstName: "Ravi", lastName: null, username: "ravi2015" }
  ];
  const coach = { firstName: "Meena", lastName: "Raj", username: "coach_meena" };

  it("replaces full names before first names, any case, by position in the list", () => {
    expect(pseudonymiseTranscript("asha kumar, look here. Asha and RAVI did well", students, coach)).toBe(
      "S1, look here. S1 and S2 did well"
    );
  });

  it("replaces usernames and the coach's name", () => {
    expect(pseudonymiseTranscript("ravi2015 asked Meena Raj; coach_meena answered", students, coach)).toBe(
      "S2 asked Coach; Coach answered"
    );
  });

  it("never replaces part of another word", () => {
    expect(pseudonymiseTranscript("Ashadeep plays Ravikumar", students, coach)).toBe("Ashadeep plays Ravikumar");
  });

  it("skips names under three letters (they would erase ordinary words)", () => {
    expect(pseudonymiseTranscript("an ox is on the board", [{ firstName: "Ox", lastName: "An" }], null)).toBe(
      "an ox is on the board"
    );
  });
});

describe("chunkTranscript", () => {
  it("keeps lines together until the budget is reached", () => {
    const line = "word ".repeat(40).trim(); // ~50 tokens
    const chunks = chunkTranscript([line, line, line, line], 120);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].split("\n")).toHaveLength(2);
  });

  it("cuts a single over-long line and drops empty ones", () => {
    const chunks = chunkTranscript(["", "x".repeat(4000), "  "], 500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(estimateTokens(chunk)).toBeLessThanOrEqual(500);
  });

  it("counts Tamil script as more tokens per character than English", () => {
    expect(estimateTokens("ராஜா முக்கியம்")).toBeGreaterThan(estimateTokens("king matters!"));
  });
});

describe("containsMoveNotation", () => {
  it.each(["Play e4 first", "then Nf3", "Bxf7+ wins", "castle with O-O", "exd5 opens it", "the E4 square", "e8=Q"])(
    "finds notation in %p",
    (text) => expect(containsMoveNotation(text)).toBe(true)
  );

  it.each(["Develop your knights before bishops", "Castle early to keep the king safe", "A pin stops a piece moving"])(
    "leaves plain words alone: %p",
    (text) => expect(containsMoveNotation(text)).toBe(false)
  );
});

describe("cleanRecapDraft", () => {
  const good = {
    keyPoints: ["Develop knights and bishops early", "Castle to keep the king safe", "Do not move the queen out too soon"],
    practice: ["Play three games focusing on development"],
    recap: "Today you learned how to start a game well. We talked about developing pieces. We also saw why castling matters."
  };

  it("keeps a clean answer as it is", () => {
    expect(cleanRecapDraft(good)).toEqual({ content: good, problem: null, removed: 0 });
  });

  it("drops sentences and items that name a student code or write notation", () => {
    const result = cleanRecapDraft({
      keyPoints: [...good.keyPoints, "S2 found a fork", "Answer Nf3 with Nc6"],
      practice: ["Student 3 should practise more", ...good.practice],
      recap: `${good.recap} S1 played very well. Remember e4 and d4.`
    });
    expect(result.removed).toBe(5);
    expect(result.content).toEqual(good);
  });

  it("is unusable without recap text or a key point", () => {
    expect(cleanRecapDraft({ keyPoints: [], recap: good.recap }).content).toBeNull();
    expect(cleanRecapDraft({ keyPoints: good.keyPoints, recap: "S1 won." }).content).toBeNull();
    expect(cleanRecapDraft("nope").content).toBeNull();
  });

  it("dedupes and caps lists", () => {
    const result = cleanRecapDraft({ keyPoints: Array.from({ length: 9 }, (_, i) => `Idea ${"x".repeat(i)}`).concat("Idea "), recap: "Fine." });
    expect(result.content?.keyPoints).toHaveLength(6);
  });
});

describe("model answers", () => {
  it("parseModelJson reads the JSON inside fences and chatter", () => {
    expect(parseModelJson('Sure!\n```json\n{"points": ["a"]}\n```')).toEqual({ points: ["a"] });
    expect(parseModelJson("no json here")).toBeNull();
  });

  it("readRecapPoints keeps usable strings only", () => {
    expect(readRecapPoints({ points: ["Pins win material", 4, "S3 asked about pins", " "] })).toEqual(["Pins win material"]);
    expect(readRecapPoints(null)).toEqual([]);
  });

  it("the final prompt tells the model the rules", () => {
    const prompt = recapFinalPrompt({ points: ["Pins"] });
    expect(prompt.system).toMatch(/Never mention any student/);
    expect(prompt.system).toMatch(/Do not write chess moves/);
    expect(prompt.user).toBe("1. Pins");
  });
});

describe("classRecapContentIssues", () => {
  it("refuses a student code anywhere, allows a real name", () => {
    expect(classRecapContentIssues({ keyPoints: ["Great work S4"], practice: [], recap: "Fine." })).toHaveLength(1);
    expect(classRecapContentIssues({ keyPoints: ["Great work Asha"], practice: [], recap: "Fine." })).toEqual([]);
  });
});

describe("usableRecapProvider", () => {
  it("is the chosen provider only when it is set up", () => {
    expect(usableRecapProvider("LOCAL", { local: true, outside: false })).toBe("LOCAL");
    expect(usableRecapProvider("OUTSIDE", { local: true, outside: false })).toBeNull();
  });
});
