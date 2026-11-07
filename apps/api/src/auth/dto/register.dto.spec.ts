import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RegisterCoachDto } from "./register-coach.dto";
import { RegisterDto } from "./register.dto";

const student = {
  confirmPassword: "password123",
  contactNumber: "9876543210",
  email: "parent@example.com",
  parentName: "Jane Doe",
  password: "password123",
  studentAge: "10",
  studentName: "John Doe"
};

const coach = {
  coachName: "Ada Coach",
  confirmPassword: "password123",
  contactNumber: "9876543210",
  email: "coach@example.com",
  password: "password123"
};

async function termsErrors(dto: object) {
  const errors = await validate(dto);
  return errors.filter((error) => error.property === "acceptedTerms");
}

describe("registration DTOs: Terms of Service + Privacy Policy checkbox", () => {
  const cases: [string, new () => object, object][] = [
    ["student", RegisterDto, student],
    ["coach", RegisterCoachDto, coach]
  ];

  it.each(cases)("a %s registration is refused unless acceptedTerms is true", async (_name, Dto, body) => {
    for (const acceptedTerms of [undefined, false, "true", 1]) {
      const dto = plainToInstance(Dto, { ...body, acceptedTerms });
      expect(await termsErrors(dto)).toHaveLength(1);
    }
    expect(await termsErrors(plainToInstance(Dto, { ...body, acceptedTerms: true }))).toHaveLength(0);
  });
});
