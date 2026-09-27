import { describe, expect, it } from "vitest";
import { cpfSchema, cpfValido } from "../../src/shared/schemas";

describe("CPF", () => {
  it("aceita e normaliza um CPF com dígitos verificadores válidos", () => {
    expect(cpfSchema.parse("529.982.247-25")).toBe("52998224725");
  });

  it("recusa CPF repetido ou com dígito verificador incorreto", () => {
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("529.982.247-24")).toBe(false);
  });
});
